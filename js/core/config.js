/* EGG RUN — shared configuration and tuning constants. */
(function (ER) {
  'use strict';

  ER.CFG = {
    // World layout (1 world unit = 1 metre)
    LANES: [-2, 0, 2],
    LANE_EDGE: 3,          // outer edge of the lane area
    CURB_W: 0.35,
    WALL_X: 5.4,           // inner surface of the side walls
    PILLAR_D: 0.8,         // how far pillars protrude from the walls
    SPRING_Y: 4.4,         // arch springline height
    CEIL_Y: 10.2,
    ARCH_SPACING: 12,
    ROW_LEN: 2,            // floor tile length

    // Camera
    CAM_BACK: 6,           // camera distance behind the dragon
    MAX_Z: 96,             // draw distance
    SPAWN_AHEAD: 104,

    // Speed / difficulty
    START_SPEED: 17,
    MAX_SPEED_ADD: 27,
    SPEED_RAMP: 2200,      // metres to approach max speed
    DIFFICULTY_RAMP: 2600, // metres to reach difficulty 1
    BOOST_MULT: 1.75,
    JET_PERIOD: 2.1,       // flame jet cycle (s)
    JET_ON: 0.85,          // seconds of each cycle the jet is burning
    JET_WARN: 0.6,         // glow telegraph before an eruption

    // Player physics
    GRAVITY: 30,
    JUMP_V: 10.2,
    FAST_FALL: 3.2,
    SLIDE_TIME: 0.72,
    LANE_LERP: 17,
    DRAGON_H: 1.7,
    HIT_H: 1.45,
    SLIDE_H: 0.62,
    HIT_HALF_W: 0.36,
    HIT_HALF_D: 0.4,
    JUMP_BUFFER: 0.16,
    BOOST_FLY_Y: 1.25,

    // Scoring
    EGG_POINTS: 10,
    COMBO_TIME: 2.8,
    COMBO_STEP: 5,         // eggs per combo multiplier step
    COMBO_MAX: 99,

    // Power-up durations (seconds)
    POWER: {
      magnet: { dur: 10, label: 'MAGNET' },
      shield: { dur: 30, label: 'SHIELD' },
      boost:  { dur: 5,  label: 'BOOST' },
      x2:     { dur: 12, label: '2X EGGS' },
      double: { dur: 14, label: 'DOUBLE JUMP' }
    },
    POWER_TYPES: ['magnet', 'shield', 'boost', 'x2', 'double'],

    EGG: {
      normal:  { eggs: 1,  label: '+1' },
      golden:  { eggs: 10, label: '+10' },
      special: { eggs: 50, label: '+50' }
    }
  };
})(window.ER = window.ER || {});
