/**
 * Created by lucas on 07/11/2016.
 */
import {
    Parameters, OutputIdentifier, FeatureExtractor, Configuration,
    ConfigurationResponse, ConfiguredOutputDescriptor,
    SampleType, ProcessInput, AdapterFlags, OutputDescriptor
} from "./FeatureExtractor";
import {Feature, FeatureSet, FeatureList} from "./Feature";
import {fromFrames, toSeconds} from "./Timestamp";
import {
    FeatureTimeAdjuster,
    createFeatureTimeAdjuster
} from "./FeatureTimeAdjuster";
import {
    ListRequest, ListResponse, Service, LoadResponse,
    ExtractorHandle
} from "./Piper";
import {PiperClient} from "./PiperClient";

export type AudioData = Float32Array[];
export type Output = {[key: string]: Feature}; // TODO rename / re-think
export type FramedAudio = IterableIterator<AudioData>;

export interface AudioStreamFormat {
    channelCount: number;
    sampleRate: number;
    length?: number;
}

export interface AudioStream {
    frames: FramedAudio;
    format: AudioStreamFormat;
}

// Note, these interfaces represent time using a simple number, in
// seconds. They don't use the Piper API Timestamp as the raw feature
// does. That's only really there for protocol compatibility.

//!!! question: is Float32Array really sensible (rather than just
//!!! number[]) for feature values?

export interface VectorFeature {
    startTime: number;
    stepDuration: number;
    data: Float32Array;
}

export interface MatrixFeature {
    startTime: number;
    stepDuration: number;
    data: Float32Array[];
}

export type TracksFeature = VectorFeature[];

export type FeatureCollectionShape = "matrix" | "vector" | "tracks" | "list";

export type FeatureCollection = {
    shape: FeatureCollectionShape;
    collected: VectorFeature | MatrixFeature | TracksFeature | FeatureList;
}

export type KeyValueObject = {[key: string]: any};
export type CreateFeatureExtractorFunction = (sampleRate: number,
                                       key: string,
                                       additionalArgs?: KeyValueObject) => FeatureExtractor;

// TODO should format be passed in or derived by the callback?
// TODO does this even make any sense? This only exists because the extractor can inform the buffer size, so one might want to stream at that size
export type CreateAudioStreamFunction = (blockSize: number,
                                         stepSize: number,
                                         format: AudioStreamFormat,
                                         additionalArgs?: KeyValueObject) => AudioStream;


export interface SimpleRequest {
    audioData: AudioData;
    audioFormat: AudioStreamFormat;
    key: string;
    outputId?: OutputIdentifier;
    parameterValues?: Parameters;
    stepSize?: number;
    blockSize?: number;
}

export interface SimpleResponse {
    features: FeatureCollection;
    outputDescriptor: OutputDescriptor;
}

export interface SimpleService {
    list(request: ListRequest): Promise<ListResponse>;
    process(request: SimpleRequest): Promise<SimpleResponse>;
    collect(request: SimpleRequest): Promise<SimpleResponse>;
}

export function* segment(blockSize: number,
                         stepSize: number,
                         audioData: AudioData): FramedAudio {
    let nStep: number = 0;
    const nSteps: number = audioData[0].length / stepSize;
    while (nStep < nSteps) {
        const start: number = nStep++ * stepSize;
        const stop: number = start + blockSize;
        yield audioData.map(channelData => {
            const block = channelData.subarray(start, stop);
            return block.length === blockSize
                ? channelData.subarray(start, stop)
                : Float32Array.of(...block, ...new Float32Array(blockSize - block.length));
        })
    }
}

export function* toProcessInputStream(stream: AudioStream,
                                      stepSize: number)
: IterableIterator<ProcessInput> {
    let nFrame: number = 0;
    for (let frame of stream.frames) {
        yield {
            timestamp: fromFrames(nFrame, stream.format.sampleRate),
            inputBuffers: frame
        };
        nFrame += stepSize;
    }
}

interface OptionalConfiguration {
    channelCount?: number;
    blockSize?: number;
    stepSize?: number;
    parameterValues?: Parameters;
}

function determineConfiguration(defaultConfig: Configuration,
                                overrides?: OptionalConfiguration): Configuration {
    let blockSize: number = overrides.blockSize || defaultConfig.framing.blockSize || 1024;
    let stepSize: number = overrides.stepSize || defaultConfig.framing.stepSize || blockSize;
    let channelCount: number = overrides.channelCount || defaultConfig.channelCount || 1; // TODO is 1 okay?

    let config: Configuration = {
        channelCount: channelCount,
        framing: {
            blockSize: blockSize,
            stepSize: stepSize
        }
    };

    if (overrides.parameterValues && overrides.parameterValues.size > 0)
        config["parameterValues"] = overrides.parameterValues;

    return config;
}

function loadAndConfigureExtractor(extractor: FeatureExtractor,
                                   defaultConfig: Configuration,
                                   channelCount: number,
                                   params: Parameters = new Map(),
                                   args: KeyValueObject = {}): [Configuration, ConfigurationResponse] {

    const config = determineConfiguration(defaultConfig, {
        blockSize: (args)["blockSize"],
        stepSize: (args)["stepSize"],
        channelCount: channelCount,
        parameterValues: params
    });

    return [config, extractor.configure(config)];
}

export function* processConfiguredExtractor(frames: FramedAudio,
                                            sampleRate: number,
                                            stepSize: number,
                                            extractor: FeatureExtractor,
                                            outputs: OutputIdentifier[]): IterableIterator<Output> {
    let nFrame: number = 0;
    const lazyOutput = function* (features: FeatureSet) {
        for (let output of outputs) {
            if (features.has(output))
                for (let feature of features.get(output))
                    yield {[output]: feature};
        }
    };

    for (let frame of frames) {
        const features: FeatureSet = extractor.process({
            timestamp: fromFrames(nFrame, sampleRate),
            inputBuffers: frame
        });

        for (let output of lazyOutput(features))
            yield output;

        nFrame += stepSize;
    }

    for (let output of lazyOutput(extractor.finish()))
        yield output;
}

function deduceShape(descriptor: ConfiguredOutputDescriptor): FeatureCollectionShape {
    const isList = descriptor.hasDuration
        || descriptor.sampleType === SampleType.VariableSampleRate
        || !descriptor.binCount;
    const isVector = descriptor.binCount === 1;
    if (isList) return "list";
    if (isVector) return "vector";
    return "matrix";
}

function reshapeVector(features: Iterable<Feature>,
                       stepDuration: number,
                       descriptor: ConfiguredOutputDescriptor) : FeatureCollection {

    // Determine whether a purported vector output (fixed spacing, one
    // bin per feature) should actually be returned as multiple
    // tracks, because it has gaps between features or feature timings
    // that overlap
    
    const tracks : TracksFeature = [];
    let currentTrack : number[] = [];
    let currentStartTime = 0;
    let n = -1;

    const outputArr = features instanceof Array ? features : [...features];

    for (let i = 0; i < outputArr.length; ++i) {

        const f = outputArr[i];
        n = n + 1;

        if (descriptor.sampleType == SampleType.FixedSampleRate &&
            typeof(f.timestamp) !== 'undefined') {
            const m = Math.round(toSeconds(f.timestamp) / stepDuration);
            if (m !== n) {
                if (currentTrack.length > 0) {
                    tracks.push({
                        startTime: currentStartTime,
                        stepDuration,
                        data: new Float32Array(currentTrack)
                    });
                    currentTrack = [];
                    n = m;
                }
                currentStartTime = m * stepDuration;
            }
        }

        currentTrack.push(f.featureValues[0]);
    }

    if (tracks.length > 0) {
        if (currentTrack.length > 0) {
            tracks.push({
                startTime: currentStartTime,
                stepDuration,
                data: new Float32Array(currentTrack)
            });
        }
        return {
            shape: "tracks",
            collected: tracks
        };
    } else {
        return {
            shape: "vector",
            collected: {
                startTime: currentStartTime,
                stepDuration,
                data: new Float32Array(currentTrack)
            }
        }
    }
}

function reshapeMatrix(features: Iterable<Feature>,
                       stepDuration: number,
                       descriptor: ConfiguredOutputDescriptor) : FeatureCollection
{
    const outputArr = features instanceof Array ? features : [...features];

    if (outputArr.length === 0) {
        return {
            shape: "matrix",
            collected: {
                startTime: 0,
                stepDuration,
                data: []
            }
        }
    } else {
        const firstFeature : Feature = outputArr[0];
        let startTime = 0;
        if (descriptor.sampleType == SampleType.FixedSampleRate &&
            typeof(firstFeature.timestamp) !== 'undefined') {
            const m = Math.round(toSeconds(firstFeature.timestamp) /
                                 stepDuration);
            startTime = m * stepDuration;
        }
        return {
            shape: "matrix",
            collected: {
                startTime,
                stepDuration,
                data: outputArr.map(feature =>
                                    new Float32Array(feature.featureValues))
            }
        };
    }
}

function reshapeList(features: Iterable<Feature>,
                     adjuster?: FeatureTimeAdjuster): FeatureCollection {
    return {
        shape: "list",
        collected: [...features].map(feature => {
            if (adjuster) {
                adjuster.adjust(feature);
            }
            return feature;
        })
    }
}

export function reshape(features: Iterable<Feature>,
                        inputSampleRate: number,
                        stepSize: number,
                        descriptor: ConfiguredOutputDescriptor,
                        adjustTimestamps: boolean = true) : FeatureCollection {
    const shape: FeatureCollectionShape = deduceShape(descriptor);
    const stepDuration: number = getFeatureStepDuration(
        inputSampleRate,
        stepSize,
        descriptor
    );
    const adjuster: FeatureTimeAdjuster = createFeatureTimeAdjuster(
        descriptor,
        stepDuration
    );

    switch (shape) {
        case "vector":
            // NB this could return either "vector" or "tracks" shape,
            // depending on the feature data
            return reshapeVector(features, stepDuration, descriptor);
        
        case "matrix":
            return reshapeMatrix(features, stepDuration, descriptor);

        case "list":
            return reshapeList(features, adjustTimestamps ? adjuster : null);
        default:
            // Assumption here that deduceShape can't return "tracks",
            // because it can't tell the difference between vector and
            // tracks without looking at potentially all the data
            throw new Error("A valid shape could not be deduced.");
    }
}

function getFeatureStepDuration(inputSampleRate: number,
                                stepSize: number,
                                descriptor: ConfiguredOutputDescriptor) {
    switch (descriptor.sampleType) {
        case SampleType.OneSamplePerStep:
            return stepSize / inputSampleRate;
        case SampleType.FixedSampleRate:
            return 1.0 / descriptor.sampleRate;
        default:
            return 1.0;
    }
}

// TODO revise "factories"
export function collect(createAudioStreamCallback: CreateAudioStreamFunction,
                        streamFormat: AudioStreamFormat,
                        createFeatureExtractorCallback: CreateFeatureExtractorFunction,
                        extractorKey: string,
                        outputId?: OutputIdentifier,
                        params?: Parameters,
                        args: KeyValueObject = {}) : FeatureCollection {
    // TODO reduce duplication with process -
    // only issue stopping calling process directly here for
    // lazyOutputs is that ConfigurationResponse and Configuration are needed
    const extractor = createFeatureExtractorCallback(
        streamFormat.sampleRate,
        extractorKey
    );

    const [config, outputs] = loadAndConfigureExtractor(
        extractor,
        extractor.getDefaultConfiguration(),
        streamFormat.channelCount,
        params,
        args
    );

    const stream: AudioStream = createAudioStreamCallback(
        config.framing.blockSize,
        config.framing.stepSize,
        streamFormat
    );
    outputId = outputId ? outputId : outputs.outputs.keys().next().value;

    if (!outputs.outputs.has(outputId)) throw Error("Invalid output identifier.");

    const descriptor: ConfiguredOutputDescriptor = outputs.outputs.get(outputId);
    const lazyOutputs = processConfiguredExtractor(
        stream.frames,
        stream.format.sampleRate,
        config.framing.stepSize,
        extractor,
        [outputId]
    );

    const lazyFeatures: Iterable<Feature> = (function* () {
        for (const output of lazyOutputs) {
            yield output[outputId];
        }
    })();

    return reshape(
        lazyFeatures,
        stream.format.sampleRate,
        config.framing.stepSize,
        descriptor
    );
}

export function* process(createAudioStreamCallback: CreateAudioStreamFunction,
                         streamFormat: AudioStreamFormat,
                         createFeatureExtractorCallback: CreateFeatureExtractorFunction,
                         extractorKey: string,
                         outputId?: OutputIdentifier,
                         params?: Parameters,
                         args: KeyValueObject = {}): IterableIterator<Feature> {
    // TODO needs wrapping to handle input domain, channel and buffer adapter?
    // this is going to happen automatically in piper-vamp /
    // emscripten extractors - Perhaps it should happen in the factory
    const extractor = createFeatureExtractorCallback(
        streamFormat.sampleRate,
        extractorKey
    );

    const [config, outputs] = loadAndConfigureExtractor(
        extractor,
        extractor.getDefaultConfiguration(),
        streamFormat.channelCount,
        params,
        args
    );

    const stream: AudioStream = createAudioStreamCallback(
        config.framing.blockSize,
        config.framing.stepSize,
        streamFormat
    );
    outputId = outputId ? outputId : outputs.outputs.keys().next().value;
    const descriptor: ConfiguredOutputDescriptor = outputs.outputs.get(outputId);
    const lazyOutputs = processConfiguredExtractor(
        stream.frames,
        stream.format.sampleRate,
        config.framing.stepSize,
        extractor,
        [outputId]
    );

    const adjuster: FeatureTimeAdjuster = createFeatureTimeAdjuster(
        descriptor,
        getFeatureStepDuration(stream.format.sampleRate, config.framing.stepSize, descriptor)
    );

    for (let output of lazyOutputs) {
        adjuster.adjust(output[outputId]);
        yield output[outputId];
    }
}

export function batchProcess(blocks: Iterable<ProcessInput>,
                             process: (block: ProcessInput) => Promise<FeatureSet>,
                             finish: () => Promise<FeatureSet>)
: Promise<FeatureSet> {

    const processThunks: (() => Promise<FeatureSet>)[] =
        [...blocks].map(block => () => process(block))
            .concat([finish]);

    return processThunks.reduce((runningFeatures, nextBlock) => {
        return runningFeatures.then((features) => {
            return concatFeatures(features, nextBlock());
        });
    }, Promise.resolve(new Map() as FeatureSet));
}

function concatFeatures(running: FeatureSet, nextBlock: Promise<FeatureSet>): Promise<FeatureSet> {
    return nextBlock.then((block) => {
        for (let [i, feature] of block.entries()) {
            createOrConcat(feature, i, running);
        }
        return running;
    });
}

function createOrConcat(data: FeatureList, key: string, map: FeatureSet) {
    if (map.has(key)) {
        const a = map.get(key);
        a.push.apply(a, data);
    } else {
        map.set(key, data);
    }
}

export interface SimpleConfigurationResponse {
    handle: ExtractorHandle;
    inputSampleRate: number; // TODO this is here for convenience - might not belong here
    configuredOutputId: string;
    configuredBlockSize: number;
    configuredStepSize: number;
    outputDescriptor: OutputDescriptor;
}

export function loadAndConfigure(request: SimpleRequest,
                                 service: Service): Promise<SimpleConfigurationResponse> {
    
    const load = (request: SimpleRequest) => (response: ListResponse): Promise<LoadResponse> => {
        const metadata = response.available.filter(metadata => metadata.key === request.key);
        if (metadata.length !== 1) throw Error("Invalid key.");

        return service.load({
            key: request.key,
            inputSampleRate: request.audioFormat.sampleRate,
            adapterFlags: [AdapterFlags.AdaptAllSafe]
        });
    };

    const configure = (request: SimpleRequest) => (res: LoadResponse): Promise<SimpleConfigurationResponse> => {
        const config = determineConfiguration(
            res.defaultConfiguration,
            {
                blockSize: request.blockSize,
                stepSize: request.stepSize,
                channelCount: request.audioFormat.channelCount,
                parameterValues: request.parameterValues
            }
        );

        return service.configure({
            handle: res.handle,
            configuration: config
        }).then(res => {
            const outputId = request.outputId
                ? request.outputId
                : res.outputList[0].basic.identifier;

            if (res.outputList.filter(output => output.basic.identifier === outputId).length === 0)
                throw Error("Invalid output identifier.");

            return {
                handle: res.handle,
                inputSampleRate: request.audioFormat.sampleRate,
                configuredOutputId: outputId,
                configuredBlockSize: config.framing.blockSize,
                configuredStepSize: config.framing.stepSize,
                outputDescriptor: res.outputList
                    .find(output => output.basic.identifier === outputId)
            }
        });
    };

    // TODO come up with a mechanism for pipelining requests to reduce client-server round-trips
    return service.list({}) // TODO is the list really necessary? - prevents doing any processing if the extractor / output is not available
        .then(load(request))
        .then(configure(request))
}

export class PiperSimpleClient implements SimpleService {
    private client: Service;

    constructor(service: Service) {
        this.client = new PiperClient(service);
    }

    list(request: ListRequest): Promise<ListResponse> {
        return this.client.list(request);
    }

    process(request: SimpleRequest): Promise<SimpleResponse> {
        return loadAndConfigure(request, this.client).then(this.processAndFinish(request));
    }

    collect(request: SimpleRequest): Promise<SimpleResponse> {
        return loadAndConfigure(request, this.client).then(this.processAndFinish(request, false));
    }

    private processAndFinish(request: SimpleRequest,
                             forceList: boolean = true): (res: SimpleConfigurationResponse) => Promise<SimpleResponse> {

        // TODO implement something better than batchProcess?
        return (res: SimpleConfigurationResponse) => {
            // TODO refactor parts of processConfiguredExtractor for use here / reduce dup

            const blocks = toProcessInputStream({
                frames: segment(
                    res.configuredBlockSize,
                    res.configuredStepSize,
                    request.audioData
                ),
                format: request.audioFormat
            }, res.configuredStepSize);

            return batchProcess(
                blocks,
                (block) => this.client.process({
                    handle: res.handle,
                    processInput: block
                }).then(response => response.features),
                () => this.client.finish({handle: res.handle}).then(res => res.features)
            ).then(featureSet => {
                const features: FeatureList = featureSet.get(res.configuredOutputId) || [];
                return forceList ? {
                    features: {
                        shape: "list",
                        collected: features
                    },
                    outputDescriptor: res.outputDescriptor
                } : {
                    features: reshape(
                        features,
                        res.inputSampleRate,
                        res.configuredStepSize,
                        res.outputDescriptor.configured,
                        false
                    ),
                    outputDescriptor: res.outputDescriptor
                }
            });
        }
    };
}
