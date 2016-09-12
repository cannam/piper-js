/* -*- c-basic-offset: 4 indent-tabs-mode: nil -*-  vi:set ts=8 sts=4 sw=4: */

import chai = require('chai');
import chaiAsPromised = require('chai-as-promised');

import {EmscriptenPluginServer} from "../src/EmscriptenPluginServer";

import {
    Response, StaticData, LoadRequest, AdapterFlags, LoadResponse,
    ConfigurationRequest, Configuration, ConfigurationResponse,
    ProcessRequest, ProcessBlock, ProcessFunction
} from "../src/PluginServer";

import {Feature} from "../src/Feature";
import {Timestamp,frame2timestamp} from "../src/Timestamp";
import {batchProcess} from "../src/AudioUtilities";

chai.should();
chai.use(chaiAsPromised);

describe('ProcessPerformanceTest', () => {

    const server = new EmscriptenPluginServer();

    const iterations = 1000;
    
    const runProcessTest = function (key : string,
				     pfunc : ProcessFunction,
				     done : MochaDone) {

        const rate : number = 44100;
        
        server.loadPlugin({
            pluginKey : key,
            inputSampleRate : rate,
            adapterFlags : [AdapterFlags.AdaptAllSafe]
        }).then(response => {
            const centroidHandle : number = response.pluginHandle;
            let stepSize : number = response.defaultConfiguration.stepSize;
            let blockSize : number = response.defaultConfiguration.blockSize;
	    if (blockSize === 0) {
		blockSize = 1024;
		stepSize = blockSize;
	    }
            server.configurePlugin({
                pluginHandle : centroidHandle,
                configuration : {
                    blockSize : blockSize,
                    stepSize : stepSize,
                    channelCount : 1
                }
            }).then(response => {
                const makeBlock = ((n : number) => { 
                    return {
                        timestamp : frame2timestamp(n * blockSize, rate),
                        inputBuffers : [
                          { values : new Float32Array(
                              Array.from(Array(blockSize).keys(),
                                         n => n / blockSize)) }
                        ],
                    }
                });
                const blocks : ProcessBlock[] =
                    Array.from(Array(iterations).keys(), makeBlock);
                const results = batchProcess(
                    blocks,
                    b => pfunc({
                        pluginHandle : centroidHandle,
                        processInput : b
                    }));
                results.then(features => {
                    let sum = features[0].reduce(
                        (acc, f) => {
                            return acc + f.values.reduce((acc, v) => acc + v, 0.0);
                        }, 0.0);
                    if (sum === 0) throw("This should not happen");
                    done();
                }, err => { console.log("failure: " + err); })
	    })
	})
    };

    it('Process ' + iterations + ' freq-domain blocks with JSON array serialisation', function (done) {
        this.timeout(0); // Suppress the timeout. Only possible when
			 // using a classic function rather than arrow
	runProcessTest ("vamp-example-plugins:spectralcentroid",
			req => server.processJson(req), done);
    });
    it('Process ' + iterations + ' freq-domain blocks with JSON array serialisation (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:spectralcentroid",
			req => server.processJson(req), done);
    });

    it('Process ' + iterations + ' freq-domain blocks with base-64 serialisation', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:spectralcentroid",
			req => server.processBase64(req), done);
    });
    it('Process ' + iterations + ' freq-domain blocks with base-64 serialisation (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:spectralcentroid",
			req => server.processBase64(req), done);
    });

    it('Process ' + iterations + ' freq-domain blocks with raw memory transfer', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:spectralcentroid",
			req => server.processRaw(req), done);
    });
    it('Process ' + iterations + ' freq-domain blocks with raw memory transfer (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:spectralcentroid",
			req => server.processRaw(req), done);
    });

    it('Process ' + iterations + ' time-domain blocks with JSON array serialisation', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing",
			req => server.processJson(req), done);
    });

    it('Process ' + iterations + ' time-domain blocks with JSON array serialisation (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing",
			req => server.processJson(req), done);
    });

    it('Process ' + iterations + ' time-domain blocks with base-64 serialisation', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing",
			req => server.processBase64(req), done);
    });

    it('Process ' + iterations + ' time-domain blocks with base-64 serialisation (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing",
			req => server.processBase64(req), done);
    });

    it('Process ' + iterations + ' time-domain blocks with raw memory transfer', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing",
			req => server.processRaw(req), done);
    });
    it('Process ' + iterations + ' time-domain blocks with raw memory transfer (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:zerocrossing",
			req => server.processRaw(req), done);
    });

    it('Process ' + iterations + ' spectrogram blocks with JSON array serialisation', function (done) {
        this.timeout(0); // Suppress the timeout. Only possible when
			 // using a classic function rather than arrow
	runProcessTest ("vamp-example-plugins:powerspectrum",
			req => server.processJson(req), done);
    });

    it('Process ' + iterations + ' spectrogram blocks with JSON array serialisation (run 2)', function (done) {
        this.timeout(0); // Suppress the timeout. Only possible when
			 // using a classic function rather than arrow
	runProcessTest ("vamp-example-plugins:powerspectrum",
			req => server.processJson(req), done);
    });

    it('Process ' + iterations + ' spectrogram blocks with base-64 serialisation', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:powerspectrum",
			req => server.processBase64(req), done);
    });
    it('Process ' + iterations + ' spectrogram blocks with base-64 serialisation (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:powerspectrum",
			req => server.processBase64(req), done);
    });

    it('Process ' + iterations + ' spectrogram blocks with raw memory transfer', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:powerspectrum",
			req => server.processRaw(req), done);
    });
    it('Process ' + iterations + ' spectrogram blocks with raw memory transfer (run 2)', function (done) {
        this.timeout(0);
	runProcessTest ("vamp-example-plugins:powerspectrum",
			req => server.processRaw(req), done);
    });

});

