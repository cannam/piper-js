module.exports.one = new Map([
    ["counts", [{
        "featureValues": new Float32Array([5]),
        "timestamp": {"s": 0, "n": 0}
    }]],
    ["zerocrossings", [{"timestamp": {"n": 62500000, "s": 0}},
        {"timestamp": {"n": 125000000, "s": 0}},
        {"timestamp": {"n": 250000000, "s": 0}},
        {"timestamp": {"n": 312500000, "s": 0}},
        {"timestamp": {"n": 437500000, "s": 0}}]]
]);

module.exports.two = new Map([
    ["counts", [{
        "featureValues": new Float32Array([6]),
        "timestamp": {"s": 0, "n": 500000000}
    }]],
    ["zerocrossings", [{"timestamp": {"n": 500000000, "s": 0}},
        {"timestamp": {"n": 562500000, "s": 0}},
        {"timestamp": {"n": 625000000, "s": 0}},
        {"timestamp": {"n": 750000000, "s": 0}},
        {"timestamp": {"n": 812500000, "s": 0}},
        {"timestamp": {"n": 937500000, "s": 0}}]]
]);

module.exports.merged = new Map([
    ["counts", [{
        "featureValues": new Float32Array([5]),
        "timestamp": {"s": 0, "n": 0}
    }, {
        "featureValues": new Float32Array([6]),
        "timestamp": {"s": 0, "n": 500000000}
    }]],
    ["zerocrossings", [
        {"timestamp": {"n": 62500000, "s": 0}},
        {"timestamp": {"n": 125000000, "s": 0}},
        {"timestamp": {"n": 250000000, "s": 0}},
        {"timestamp": {"n": 312500000, "s": 0}},
        {"timestamp": {"n": 437500000, "s": 0}},
        {"timestamp": {"n": 500000000, "s": 0}},
        {"timestamp": {"n": 562500000, "s": 0}},
        {"timestamp": {"n": 625000000, "s": 0}},
        {"timestamp": {"n": 750000000, "s": 0}},
        {"timestamp": {"n": 812500000, "s": 0}},
        {"timestamp": {"n": 937500000, "s": 0}}
    ]]
]);

