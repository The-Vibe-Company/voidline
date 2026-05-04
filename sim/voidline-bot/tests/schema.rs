use voidline_bot::{Snapshot, SCHEMA_VERSION};

#[test]
fn snapshot_fixture_roundtrips() {
    let raw = include_str!("fixtures/snapshot-v1.json");
    let snapshot: Snapshot = serde_json::from_str(raw).expect("fixture should deserialize");
    assert_eq!(snapshot.schema_version, SCHEMA_VERSION);
    let encoded = serde_json::to_string(&snapshot).expect("snapshot should serialize");
    let decoded: Snapshot = serde_json::from_str(&encoded).expect("roundtrip should deserialize");
    assert_eq!(snapshot, decoded);
}

#[test]
fn boss_timers_deserialize_from_camel_case() {
    // The host emits camelCase; EnemySnapshot uses #[serde(rename_all = "camelCase")]
    // so boss_shot_timer should map to bossShotTimer. Lock that in to prevent
    // a regression that would silently disable boss-volley anticipation.
    let raw = r#"{
        "schema_version": 1,
        "mode": "playing",
        "wave": 5,
        "waveTimer": 10.0,
        "runElapsed": 100.0,
        "score": 0,
        "currency": 0,
        "hp": 100.0,
        "maxHp": 100.0,
        "player": {"x":0,"y":0,"speed":0,"damage":0,"fireRate":0,"range":0,"projectileCount":0,"pierce":0,"critChance":0},
        "enemies": [{
            "id": 1, "kind": "brute", "x": 0, "y": 0, "radius": 40,
            "hp": 1500, "maxHp": 1500, "speed": 30, "damage": 40, "isBoss": true,
            "attackState": "idle", "attackProgress": 0, "attackTargetX": 0, "attackTargetY": 0,
            "bossShotTimer": 0.4, "bossSpawnTimer": 2.5
        }],
        "orbs": []
    }"#;
    let snapshot: Snapshot = serde_json::from_str(raw).expect("snapshot should parse");
    let boss = snapshot.enemies.first().expect("one enemy");
    assert_eq!(boss.boss_shot_timer, Some(0.4));
    assert_eq!(boss.boss_spawn_timer, Some(2.5));
}
