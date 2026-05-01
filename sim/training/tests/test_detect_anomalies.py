from voidline_rl.detect_anomalies import detect


def test_detect_flags_dominant_pick():
    report = {
        "profiles": [
            {
                "playerProfile": "learned-optimizer",
                "policies": [
                    {
                        "policy": "focused-attack",
                        "upgradePickRates": [
                            {
                                "id": "upgrade:twin-cannon",
                                "pickRateWhenOffered": 0.9,
                                "offerRatePerRun": 0.2,
                            }
                        ],
                        "relicPickRates": [],
                        "warnings": [],
                    }
                ],
            }
        ]
    }

    flags = detect(report)

    assert flags[0]["kind"] == "dominant-pick"
    assert flags[0]["subject"] == "upgrade:twin-cannon"
