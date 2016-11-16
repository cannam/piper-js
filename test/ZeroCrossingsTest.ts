/**
 * Created by lucas on 26/08/2016.
 */

import chai = require('chai');
import {ProcessInput} from "../src/FeatureExtractor";
import ZeroCrossings from "../src/extractors/ZeroCrossings";
import {FeatureSet} from "../src/Feature";
import {frame2timestamp} from "../src/Timestamp";
chai.should();

describe('ZeroCrossings', () => {
    const toProcessInput = (buffer: Float32Array): ProcessInput => {
        return {
            timestamp: {s: 0, n: 0},
            inputBuffers: [buffer]
        };
    };

    describe('.process()', () => {
        it('Should return a count of zero for a buffer of zeros, and have no crossing points', () => {
            let zc = new ZeroCrossings(16);
            let block = toProcessInput(new Float32Array(8));
            let features: FeatureSet = zc.process(block);
            features.get("counts").should.deep.equal([{featureValues: new Float32Array([0])}]);
            features.size.should.equal(1);
        });

        it('Should return a count of 5 for an input which crosses 5 times, with the locations of the crossings', () => {
            let zc = new ZeroCrossings(16);
            let block = toProcessInput(new Float32Array([0, 1, -1, 0, 1, -1, 0, 1]));
            let features: FeatureSet = zc.process(block);

            features.get("counts").should.deep.equal([{
                featureValues: new Float32Array([5])
            }]);

            [1,2,4,5,7].forEach((frame, index) => frame2timestamp(frame, 16)
                .should.eql(features.get("crossings")[index].timestamp));
        });

        it('Should keep the last sample from the previous block and thus cross once', () => {
            let zc = new ZeroCrossings(16);
            let block = toProcessInput(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]));
            zc.process(block);
            block.inputBuffers[0].fill(0);
            let features: FeatureSet = zc.process(block);
            features.get("counts").should.deep.equal([{featureValues: new Float32Array([1])}]);
            features.get("crossings").length.should.equal(1);
        });
    })
});
