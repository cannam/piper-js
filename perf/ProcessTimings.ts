/* -*- indent-tabs-mode: nil -*-  vi:set ts=8 sts=4 sw=4: */

import chai = require('chai');
import chaiAsPromised = require('chai-as-promised');

import {FeatsModuleClient} from "PiperClient.ts";

import {
    LoadRequest, LoadResponse,
    ConfigurationRequest, ConfigurationResponse,
    ProcessRequest
} from "Piper.ts";

import {
    AdapterFlags, StaticData, Configuration, ProcessInput
} from "../src/FeatureExtractor";

import {Feature} from "../src/Feature";
import {Timestamp,frame2timestamp} from "../src/Timestamp";
import {batchProcess} from "../test/AudioUtilities";

import VampExamplePlugins = require("../ext/VampExamplePlugins");
import {EmscriptenModuleRequestHandler} from "EmscriptenProxy.ts";

chai.should();
chai.use(chaiAsPromised);

describe('ProcessTimings', () => {

    const server = new FeatsModuleClient(
        new EmscriptenModuleRequestHandler(VampExamplePlugins()));

    const iterations = 1000;
    
    const runProcessTest = function (key : string,
                                     outputId : string,
				     done : MochaDone) {

        const rate : number = 44100;
        
        server.load({
            key : key,
            inputSampleRate : rate,
            adapterFlags : [AdapterFlags.AdaptAllSafe]
        }).then(response => {
            const phandle : number = response.handle;
            let stepSize : number = response.defaultConfiguration.stepSize;
            let blockSize : number = response.defaultConfiguration.blockSize;
	    if (blockSize === 0) {
		blockSize = 1024;
		stepSize = blockSize;
	    }
            server.configure({
                handle : phandle,
                configuration : {
                    blockSize : blockSize,
                    stepSize : stepSize,
                    channelCount : 1
                }
            }).then(response => {

                const makeBlock = ((n : number) => {
                    const arr = new Float32Array(blockSize);
                    for (let i = 0; i < blockSize; ++i) {
                        arr[i] = i / blockSize;
                    }
                    return {
                        timestamp : frame2timestamp(n * blockSize, rate),
                        inputBuffers : [ arr ],
                    }
                });
                const blocks : ProcessInput[] =
                    Array.from(Array(iterations).keys(), makeBlock);
                const results = batchProcess(
                    blocks,
                    b => server.process({
                        handle : phandle,
                        processInput : b
                    }),
                    () => server.finish({
                        handle : phandle
                    }));
                results.then(features => {
                    let sum = features.get(outputId).reduce(
                        (acc, f) => {
                            return acc + f.featureValues.reduce((acc, v) => acc + v, 0.0);
                        }, 0.0);
                    if (sum === 0) throw("This should not happen");
                    console.log("      sum = " + sum);
                    done();
                }, err => { console.log("failure: " + err); })
	    })
	})
    };

    it('Process ' + iterations + ' time-domain blocks', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing", "counts", done);
    });

    it('Process ' + iterations + ' freq-domain blocks', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:spectralcentroid", "logcentroid", done);
    });

    it('Process ' + iterations + ' spectrogram blocks', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:powerspectrum", "powerspectrum", done);
    });

    it('Process ' + iterations + ' time-domain blocks [second run]', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing", "counts", done);
    });

    it('Process ' + iterations + ' freq-domain blocks [second run]', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:spectralcentroid", "logcentroid", done);
    });

    it('Process ' + iterations + ' spectrogram blocks [second run]', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:powerspectrum", "powerspectrum", done);
    });

});
