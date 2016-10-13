/**
 * Created by lucast on 08/09/2016.
 */
import {toSeconds, frame2timestamp, Timestamp, makeTimestamp} from "feats/dist/ts/Timestamp";
import {OutputDescriptor, SampleType} from "feats/dist/ts/FeatureExtractor";
import {Feature} from "feats/dist/ts/Feature";

export interface FeatureTimeAdjuster {
    adjust(feature: Feature, inputTimestamp?: Timestamp): void;
}

export class VariableSampleRateFeatureTimeAdjuster implements FeatureTimeAdjuster {
    constructor(private descriptor: OutputDescriptor) {}

    adjust(feature: Feature): void {
        if (!feature.hasOwnProperty("timestamp")) throw new Error("Feature must have a timestamp");
        const hasSampleRate: boolean = this.descriptor.configured.hasOwnProperty("sampleRate") && this.descriptor.configured.sampleRate !== 0.0;
        if (!feature.hasOwnProperty("duration"))
            feature.duration = hasSampleRate ? frame2timestamp(1, this.descriptor.configured.sampleRate) : {s: 0, n: 0};
    }
}

export class FixedSampleRateFeatureTimeAdjuster implements FeatureTimeAdjuster {
    private lastFeatureIndex: number;

    constructor(private descriptor: OutputDescriptor) {
        if (!descriptor.configured.hasOwnProperty("sampleRate") || descriptor.configured.sampleRate === 0.0) throw new Error("OutputDescriptor must provide a sample rate.");
        this.lastFeatureIndex = -1;
    }

    adjust(feature: Feature): void {
        const sr: number = this.descriptor.configured.sampleRate;
        const featureIndex: number = feature.hasOwnProperty("timestamp") ? Math.round(toSeconds(feature.timestamp) * sr) : this.lastFeatureIndex + 1;
        feature.timestamp = frame2timestamp(featureIndex, sr);
        feature.duration = feature.hasOwnProperty("duration") ? frame2timestamp(Math.round(toSeconds(feature.duration) * sr), sr) : {s: 0, n: 0};
        this.lastFeatureIndex = featureIndex;
    }
}

export class OneSamplePerStepFeatureTimeAdjuster implements FeatureTimeAdjuster {
    private stepSizeSeconds: number;
    private previousTimestamp: Timestamp;

    constructor(stepSizeSeconds: number) {
        if (stepSizeSeconds === undefined)
            throw new Error("Host must provide the step size (seconds).");
        this.stepSizeSeconds = stepSizeSeconds;
        this.previousTimestamp = {s: 0.0, n: 0.0};
    }

    adjust(feature: Feature, inputTimestamp: Timestamp): void {
        const isValidTimestamp = inputTimestamp && inputTimestamp.hasOwnProperty("s") && inputTimestamp.hasOwnProperty("n");
        feature.timestamp = isValidTimestamp ? inputTimestamp : this.calculateNextTimestamp();
        delete feature.duration; // host should ignore duration
        this.previousTimestamp = feature.timestamp;
    }

    private calculateNextTimestamp() {
        return makeTimestamp(toSeconds(this.previousTimestamp) + this.stepSizeSeconds);
    }
}

export function
createFeatureTimeAdjuster(descriptor: OutputDescriptor, stepSizeSeconds?: number)
: FeatureTimeAdjuster {

    switch (descriptor.configured.sampleType) {
        case SampleType.OneSamplePerStep:
            return new OneSamplePerStepFeatureTimeAdjuster(stepSizeSeconds);
        case SampleType.VariableSampleRate:
            return new VariableSampleRateFeatureTimeAdjuster(descriptor);
        case SampleType.FixedSampleRate:
            return new FixedSampleRateFeatureTimeAdjuster(descriptor);
    }
    throw new Error("No valid FeatureTimeAdjuster could be constructed.");
}