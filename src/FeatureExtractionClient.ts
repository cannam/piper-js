/* -*- indent-tabs-mode: nil -*-  vi:set ts=8 sts=4 sw=4: */
/**
 * Created by lucast on 31/08/2016.
 */


import {
    FeatureTimeAdjuster, createFeatureTimeAdjuster
} from "./FeatureTimeAdjuster";
import {FeatureSet} from "./Feature";
import {Timestamp} from "./Timestamp";
import {
    PluginHandle, ListResponse, LoadRequest, ConfigurationRequest, ConfigurationResponse,
    LoadResponse, ProcessRequest, FinishRequest, Protocol
} from "./Piper";
import {Client} from "./Piper";

export class FeatureExtractionClient implements Client {
    private timeAdjusters: Map<string, FeatureTimeAdjuster>;
    private handleToSampleRate: Map<PluginHandle, number>;
    private protocol: Protocol;

    constructor(protocol: Protocol) {
        this.timeAdjusters = new Map();
        this.handleToSampleRate = new Map();
        this.protocol = protocol;
    }

    public list(): Promise<ListResponse> {
        this.protocol.writeListRequest();
        this.protocol.transport.flush();
        return Promise.resolve(this.protocol.readListResponse()); // TODO this isn't right at all (Promise.resolve)
    }

    public load(request: LoadRequest): Promise<LoadResponse> {
        this.protocol.writeLoadRequest(request);
        this.protocol.transport.flush();
        return Promise.resolve(this.protocol.readLoadResponse())
            .then(response => {
                this.handleToSampleRate.set(response.pluginHandle, request.inputSampleRate);
                return response;
            });
    }

    public configure(request: ConfigurationRequest): Promise<ConfigurationResponse> {
        this.protocol.writeConfigurationRequest(request);
        this.protocol.transport.flush();
        return Promise.resolve(this.protocol.readConfigurationResponse())
            .then(response => {
                for (let output of response.outputList) {
                    this.timeAdjusters.set(output.basic.identifier, createFeatureTimeAdjuster(
                        output, request.configuration.stepSize / this.handleToSampleRate.get(request.pluginHandle))
                    );
                }
                return response;
            });
    }

    public process(request: ProcessRequest): Promise<FeatureSet> {
        this.protocol.writeProcessRequest(request);
        this.protocol.transport.flush();
        return Promise.resolve(this.protocol.readProcessResponse()).then(response => {
            this.adjustFeatureTimes(response.features, request.processInput.timestamp);
            return response.features;
        });
    }

    public finish(request: FinishRequest): Promise<FeatureSet> {
        return this.request({type: "finish", content: request}).then((response) => {
            const features: FeatureSet = PiperClient.responseToFeatureSet(response);
            this.adjustFeatureTimes(features);
            this.handleToSampleRate.delete(request.pluginHandle);
            return features;
        });
    }

    private adjustFeatureTimes(features: FeatureSet, inputTimestamp?: Timestamp) {
        for (let [i, featureList] of features.entries()) {
            const adjuster: FeatureTimeAdjuster = this.timeAdjusters.get(i);
            featureList.map(feature => adjuster.adjust(feature, inputTimestamp));
        }
    }
}
