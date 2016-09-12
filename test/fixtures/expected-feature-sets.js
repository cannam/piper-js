module.exports.one = new Map([
    [0, [{"values": [5]}]],
    [1, [{"timestamp": {"n": 62500000, "s": 0}},
        {"timestamp": {"n": 125000000, "s": 0}},
        {"timestamp": {"n": 250000000, "s": 0}},
        {"timestamp": {"n": 312500000, "s": 0}},
        {"timestamp": {"n": 437500000, "s": 0}}]]
]);

module.exports.two = new Map([
    [0, [{"values": [6]}]],
    [1, [{"timestamp": {"n": 500000000, "s": 0}},
        {"timestamp": {"n": 562500000, "s": 0}},
        {"timestamp": {"n": 625000000, "s": 0}},
        {"timestamp": {"n": 750000000, "s": 0}},
        {"timestamp": {"n": 812500000, "s": 0}},
        {"timestamp": {"n": 937500000, "s": 0}}]]
]);

module.exports.merged = new Map([
    [0, [[{"values": [5]}], [{"values": [6]}]]],
    [1, [
        [
            {"timestamp": {"n": 62500000, "s": 0}},
            {"timestamp": {"n": 125000000, "s": 0}},
            {"timestamp": {"n": 250000000, "s": 0}},
            {"timestamp": {"n": 312500000, "s": 0}},
            {"timestamp": {"n": 437500000, "s": 0}}
        ],
        [
            {"timestamp": {"n": 500000000, "s": 0}},
            {"timestamp": {"n": 562500000, "s": 0}},
            {"timestamp": {"n": 625000000, "s": 0}},
            {"timestamp": {"n": 750000000, "s": 0}},
            {"timestamp": {"n": 812500000, "s": 0}},
            {"timestamp": {"n": 937500000, "s": 0}}
        ]

    ]]
]);