/**
 * Which files under the game asset tree ship at all.
 *
 * A leaf module on purpose: both `add-vl2` (which decides what to extract)
 * and the deploy sync (which decides what to upload) read it, and the sync
 * runs in CI where pulling in the rest of `assets.ts` — unzipper, the
 * manifest, the `@/src` path alias — would be dead weight.
 */
import ignore from "ignore";

/**
 * Files the map tool never uses. Archives that are nothing but such files
 * — player skins, voice binds — are indistinguishable from useful ones by
 * type, so don't add those at all. Random scripts are typically fine,
 * since they're small (and other scripts may expect them to be available).
 *
 * effects/*.ifr are Immersion force-feedback projects (the game drives them
 * through IFC22.dll) and .sfk is Sound Forge's waveform cache — neither has
 * anything to render.
 */
export const assetIgnoreList = ignore().add(`
fonts/
lighting/
prefs/
.DS_Store
._*
__MACOSX/
desktop.ini
*.dso
*.gui
*.ico
*.ifr
*.ml
*.nav
*.sfk
*.txt
*.md
*.db
.gitattributes
.gitignore
`);
