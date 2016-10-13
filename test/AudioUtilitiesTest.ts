/**
 * Created by lucas on 02/09/2016.
 */
import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
chai.should();
chai.use(chaiAsPromised);
import {Feature, FeatureSet, FeatureList} from "feats/dist/ts/Feature";
import {ProcessInput} from "feats/dist/ts/FeatureExtractor";
import {batchProcess, lfo, generateSineWave, segmentAudioBuffer, segment, AudioBufferStub} from "./AudioUtilities";
import {FeatureExtractor} from "feats/dist/ts/FeatureExtractor";
import {FeatureExtractorStub} from "./fixtures/FeatureExtractorStub";

describe("BatchBlockProcess", () => {
    it("should aggregate features extracted from multiple blocks", () => {
        const expectedFeatures: FeatureList = [];
        expectedFeatures.push({featureValues: new Float32Array([8])} as Feature);
        expectedFeatures.push({featureValues: new Float32Array([4])} as Feature);

        const blocks: ProcessInput[] = [];

        blocks.push({
            timestamp: {s: 0, n: 0},
            inputBuffers: [new Float32Array([1, 1, 1, 1, 1, 1, 1, 1])]
        });

        blocks.push({
            timestamp: {s: 0, n: 500000000},
            inputBuffers: [new Float32Array([0, 0, 0, 0, 1, 1, 1, 1])]
        });

        const extractor: FeatureExtractor = new FeatureExtractorStub();
        const features: Promise<FeatureSet> = batchProcess(
            blocks,
            block => Promise.resolve(extractor.process(block)),
            () => Promise.resolve(extractor.finish()));
        return features.then((aggregate) => {
            aggregate.get("sum").should.deep.equal(expectedFeatures);
        });
    });

    it("processes the blocks sequentially", () => {
        const expectedFeatures: FeatureList = [];
        expectedFeatures.push({featureValues: new Float32Array([4])} as Feature);
        expectedFeatures.push({featureValues: new Float32Array([12])} as Feature);

        const blocks: ProcessInput[] = [];

        blocks.push({
            timestamp: {s: 0, n: 0},
            inputBuffers: [new Float32Array([0, 0, 0, 0, 1, 1, 1, 1])]
        });

        blocks.push({
            timestamp: {s: 0, n: 500000000},
            inputBuffers: [new Float32Array([1, 1, 1, 1, 1, 1, 1, 1])]
        });

        const extractor: FeatureExtractor = new FeatureExtractorStub();
        const times = [100, 1000]; // pop the times out, so the first call takes longer than the second
        const features: Promise<FeatureSet> = batchProcess(
            blocks,
            (block) => {
                return new Promise((resolve) => {
                    setTimeout(() => { resolve(extractor.process(block)); }, times.pop());
                })
            },
            () => Promise.resolve(extractor.finish()));

        return features.then((aggregate) => {
            aggregate.get("cumsum").should.deep.equal(expectedFeatures);
        });
    });

    it("can consume blocks from a generator", () => {
        const audioData: AudioBuffer = AudioBufferStub.fromExistingFloat32Arrays([generateSineWave(440.0, 10.0, 8000.0, 0.5)], 8000.0);
        const frames: IterableIterator<ProcessInput> = segmentAudioBuffer(256, 64, audioData);
        const extractor: FeatureExtractor = new FeatureExtractorStub();
        const featureSet: Promise<FeatureSet> = batchProcess(
            frames,
            block => Promise.resolve(extractor.process(block)),
            () => Promise.resolve(extractor.finish()));
        return featureSet.then(featureSet => featureSet.get("sum").length.should.equal((10.0 * 8000.0) / 64.0));
    });
});

describe("Segment", () => {
    const blockSize: number = 8;
    const stepSize: number = 4;
    const nBlocks: number = 4;
    const audioData: Float32Array = new Float32Array(nBlocks * blockSize);
    const fillBlocksWithConsecutiveIntegers = (audioData: Float32Array) => {
        for (let nBlock = 1; nBlock < nBlocks; ++nBlock)
            audioData.fill(nBlock, nBlock * blockSize, (nBlock * blockSize) + blockSize);
    };

    fillBlocksWithConsecutiveIntegers(audioData);
    let frames: IterableIterator<Float32Array>;

    beforeEach("reset segment generator", () => {
        frames = segment(blockSize, stepSize, audioData)
    });

    it("Should zero pad the block when there are no more samples", () => {
        frames = segment(blockSize, stepSize, new Float32Array(0));
        frames.next().value.should.deep.equal(new Float32Array(blockSize));
    });

    it('Can be used as an iterator', () => {
        frames.next().value.should.deep.equal(new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]));
        frames.next().value.should.deep.equal(new Float32Array([0, 0, 0, 0, 1, 1, 1, 1]));
        frames.next().value.should.deep.equal(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]));
        frames.next().value.should.deep.equal(new Float32Array([1, 1, 1, 1, 2, 2, 2, 2]));
        frames.next().value.should.deep.equal(new Float32Array([2, 2, 2, 2, 2, 2, 2, 2]));
        frames.next().value.should.deep.equal(new Float32Array([2, 2, 2, 2, 3, 3, 3, 3]));
        frames.next().value.should.deep.equal(new Float32Array([3, 3, 3, 3, 3, 3, 3, 3]));
        frames.next().value.should.deep.equal(new Float32Array([3, 3, 3, 3, 0, 0, 0, 0]));
        return frames.next().done.should.be.true;
    });

    it('Can be looped over', () => {
        const expectedBlocks: number[][] = [
            [ 0, 0, 0, 0, 0, 0, 0, 0 ],
            [ 0, 0, 0, 0, 1, 1, 1, 1 ],
            [ 1, 1, 1, 1, 1, 1, 1, 1 ],
            [ 1, 1, 1, 1, 2, 2, 2, 2 ],
            [ 2, 2, 2, 2, 2, 2, 2, 2 ],
            [ 2, 2, 2, 2, 3, 3, 3, 3 ],
            [ 3, 3, 3, 3, 3, 3, 3, 3 ],
            [ 3, 3, 3, 3, 0, 0, 0, 0 ]
        ];
        let i = 0;
        for (let block of frames)
            Array.from(block).should.deep.equal(expectedBlocks[i++]);
    });
});

describe("lfo", () => {
    it("Can lazily generate a sine wave", () => {
        const expectedSine = require("./fixtures/expected-sine.json");
        const sineA: IterableIterator<number> = lfo(8000.0, 440.0, 0.5);
        const isRoughlyEqual = (value: number, expected: number) => value.should.be.approximately(expected, 0.00001);
        expectedSine.forEach((sample: number) => {
            isRoughlyEqual(sineA.next().value, sample);
        });
    });
});