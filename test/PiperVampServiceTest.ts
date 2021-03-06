/* -*- indent-tabs-mode: nil -*-  vi:set ts=8 sts=4 sw=4: */
/**
 * Created by lucast on 30/08/2016.
 */

import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
import {FeatureSet, FeatureList} from "../src/Feature";
import {Timestamp} from "../src/Timestamp";
import {batchProcess} from "../src/HigherLevelUtilities";
import VampExamplePlugins from "../ext/VampExamplePluginsModule";
import {
    PiperVampService,
    PiperVampFeatureExtractor
} from "../src/PiperVampService";
import fs = require("fs");
import {SampleType, ProcessInput, StaticData, AdapterFlags, InputDomain, FeatureExtractor} from "../src/FeatureExtractor";
import {LoadResponse, LoadRequest, ConfigurationResponse, Service} from "../src/Piper";
import {PiperClient} from "../src/PiperClient";
import {EmscriptenModule} from "../src/PiperVampService";
import VampTestPluginModule from "../ext/VampTestPluginModule";
import {
    createEmscriptenCleanerWithNodeGlobal,
    EmscriptenListenerCleaner
} from "./TestUtilities";

chai.should();
chai.use(chaiAsPromised);
const cleaner: EmscriptenListenerCleaner = createEmscriptenCleanerWithNodeGlobal();

describe("PiperVampServiceTest", () => {
    afterEach(() => cleaner.clean());
    const client: Service = new PiperClient(new PiperVampService(VampExamplePlugins()));

    const loadFixture = (name : string) => {
        // avoid sharing things through use of require
        return JSON.parse(
            fs.readFileSync(
                __dirname + "/fixtures/" + name + ".json",
                "utf8"));
    };

    it("Can list available plugins in the module", () => {
        const expectedList: StaticData[] = loadFixture("expected-plugin-list").available
            .map((data: any) => Object.assign({}, data as any, {inputDomain: InputDomain[data.inputDomain]}));
        return client.list({}).then(available => available.available.should.eql(expectedList));
    });

    const loadZeroCrossings = (): Promise<LoadResponse> => {
        return client.list({}).then((resp) => {
            return client.load({
                key: resp.available[resp.available.length - 1].key, // zero crossings
                inputSampleRate: 16,
                adapterFlags: [AdapterFlags.AdaptAllSafe]
            } as LoadRequest);
        });
    };

    const loadResponse: Promise<LoadResponse> = loadZeroCrossings();

    it("Can load an available plugin", () => {
        const expectedResponse = loadFixture("expected-load-response");
        expectedResponse.staticData.inputDomain = InputDomain[expectedResponse.staticData.inputDomain];
        return loadResponse.should.eventually.deep.equal(expectedResponse);
    });

    const handles: number[] = [];
    const config = (response: LoadResponse): Promise<ConfigurationResponse> => {
        handles.push(response.handle);
        return client.configure({
            handle: response.handle,
            configuration: {
                channelCount: 1,
                framing: {
                    blockSize: 8,
                    stepSize: 8
                }
            }
        });
    };

    it("Can configure a loaded plugin", () => {
        const configResponse: Promise<ConfigurationResponse> = loadResponse.then(config);
        let expectedResponse = Object.assign(
            {},
            loadFixture("expected-configuration-response"),
            {
                framing: {
                    blockSize: 8,
                    stepSize: 8
                }
            }
        );
        expectedResponse.outputList.forEach((output: any) => output.configured.sampleType = SampleType[output.configured.sampleType]);
        return configResponse.should.eventually.deep.equal(expectedResponse);
    });

    it("Reports an error when trying to configure an already configured plugin", () => {
        const batchConfig = Promise.all([loadResponse.then(config), loadResponse.then(config)]);
        return batchConfig.should.be.rejected;
    });

    it("Can process a single block", () => { // TODO depends on previous tests, fix
        const expectedFeatures: {one: FeatureSet, two: FeatureSet, merged: FeatureSet} = require("./fixtures/expected-feature-sets"); // a js file, not a json one
        const expectedTimestamps = (expectedFeatures.one.get("zerocrossings") as FeatureList).map(feature => feature.timestamp);

        const features: Promise<FeatureSet> = client.process({
            handle: handles[0],
            processInput: {
                timestamp: {s: 0, n: 0} as Timestamp,
                inputBuffers: [new Float32Array([0, 1, -1, 0, 1, -1, 0, 1])]
            }
        }).then(response => response.features);

        return features.then((features: FeatureSet) => {
            const timestamps = features.get("zerocrossings").map(feature => feature.timestamp);
            timestamps.should.deep.equal(expectedTimestamps);
            features.get("counts").should.deep.equal(expectedFeatures.one.get("counts"));
        });
    });

    it("Can get the remaining features and clean up the plugin", () => { // TODO depends on previous tests, fix
        const remainingFeatures: Promise<FeatureSet> = client.finish({handle: handles[0]}).then(response => response.features);
        return remainingFeatures.then(features => features.size.should.eql(0));
    });

    it("Can process multiple blocks of audio, consecutively", () => {
        const expectedFeatures: {one: FeatureSet, two: FeatureSet, merged: FeatureSet} = require("./fixtures/expected-feature-sets"); // a js file, not a json one
        const blocks: ProcessInput[] = [];

        blocks.push({
            timestamp: {s: 0, n: 0} as Timestamp,
            inputBuffers: [new Float32Array([0, 1, -1, 0, 1, -1, 0, 1])]
        } as ProcessInput);

        blocks.push({
            timestamp: {s: 0, n: 500000000} as Timestamp,
            inputBuffers: [new Float32Array([0, 1, -1, 0, 1, -1, 0, 1])]
        } as ProcessInput);


        const processBlocks: () => Promise<FeatureSet> = () => {
            const zcHandle: number = handles[handles.length - 1];
            return batchProcess(
                blocks,
                block => client.process({handle: zcHandle, processInput: block}).then(response => response.features),
                () => client.finish({handle: zcHandle}).then(response => response.features));
        };

        const features: Promise<FeatureSet> = loadZeroCrossings().then(config).then(processBlocks);
        const getTimestamps = (features: FeatureList) => features.map(feature => feature.timestamp);
        return features.then((features) => {
            features.get("counts").should.deep.equal(expectedFeatures.merged.get("counts"));
            getTimestamps(features.get("zerocrossings")).should.deep.equal(getTimestamps(expectedFeatures.merged.get("zerocrossings")));
        });
    });
});

describe("PiperVampFeatureExtractor", () => {
    afterEach(() => cleaner.clean());
    it("Can construct a plugin with a valid key", () => {
        const module: EmscriptenModule = VampTestPluginModule();
        const extractor: FeatureExtractor = new PiperVampFeatureExtractor(
            module, 16, "vamp-test-plugin:vamp-test-plugin"
        );
        return extractor.should.exist;
    });

    it("Throws on construction with invalid key", () => {
        chai.expect(() => new PiperVampFeatureExtractor(
            VampTestPluginModule(), 16, "invalid-key",
        )).to.throw(Error);
    });

    it("Uses the first available extractor when no key is provided", () => {
        return new PiperVampFeatureExtractor(VampTestPluginModule(), 16).should.exist;
    });

    it("Should provide a default configuration", () => {
        const config = new PiperVampFeatureExtractor(
            VampTestPluginModule(), 16, "vamp-test-plugin:vamp-test-plugin"
        ).getDefaultConfiguration();
        return (config.framing.hasOwnProperty("blockSize")
        && config.hasOwnProperty("channelCount")
        && config.framing.hasOwnProperty("stepSize")).should.be.true;
    });

    it("Should be configurable", () => {
        const extractor: FeatureExtractor = new PiperVampFeatureExtractor(
            VampTestPluginModule(), 16, "vamp-test-plugin:vamp-test-plugin"
        );
        const res = extractor.configure({
            channelCount: 1,
            framing: {
                stepSize: 2,
                blockSize: 4
            }
        });
        (res.outputs instanceof Map).should.be.true;
        res.framing.should.eql({
            stepSize: 2,
            blockSize: 4
        });
    });

    it("Should process a block", () => {
        const extractor: FeatureExtractor = new PiperVampFeatureExtractor(
            VampTestPluginModule(), 16, "vamp-test-plugin:vamp-test-plugin"
        );
        extractor.configure({
            channelCount: 1,
            framing: {
                stepSize: 2,
                blockSize: 4
            }
        });
        return extractor.process({
            timestamp: {n: 0, s: 0},
            inputBuffers: [new Float32Array([1, 1, 1, 1])]
        }).has("curve-fsr").should.be.true;
    });

    it("should return remaining features and clear up", () => {
        const extractor: FeatureExtractor = new PiperVampFeatureExtractor(
            VampTestPluginModule(), 16, "vamp-test-plugin:vamp-test-plugin"
        );
        extractor.configure({
            channelCount: 1,
            framing: {
                stepSize: 2,
                blockSize: 4
            }
        });
        extractor.finish().has("curve-fsr").should.be.true;
        // calling finish again should throw as the internal handle is now invalid
        chai.expect(() => extractor.finish()).to.throw(Error);
    });

});
