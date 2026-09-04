/**
 * How big a person is, and where to point a camera at one.
 *
 * These were scattered across three modules and drifted: the sight test
 * sampled a subject at 1, 3 and 5 units up, which on a
 * two-and-a-half-unit player reaches over their head — so a camera with
 * a clear line to empty air scored as seeing them. Aim height, camera
 * height and working distance all describe the same body and belong
 * together, where changing one forces you to look at the others.
 *
 * Measured, not assumed: a player's `pos` sits at their FEET (sampled
 * across Damnation, z minus terrain was 0.2-0.35), and a light-armour
 * model stands about two and a half units tall.
 */

/**
 * Where a portrait is centred. Chest — not the feet the subject is
 * anchored at, and not the rig's two-unit default, which sits on top of
 * their head and leaves them at the bottom of the frame.
 */
export const PLAYER_AIM_LIFT = 1.3;

/**
 * Camera heights to try, above the subject's feet: waist, knee, chest.
 *
 * The free-space grid cannot supply these — it samples every 8 units,
 * so its lowest cell above someone's feet already looks down on them.
 */
export const PLAYER_EYE_LIFTS = [1.2, 0.7, 1.8];

/** Working distances for a person-sized subject, nearest preferred. */
export const PLAYER_DISTS = [8, 6, 11, 14];

/** Framing radius used when a player is treated as a shot subject. */
export const PLAYER_STANDOFF = 9;
