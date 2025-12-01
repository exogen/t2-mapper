// #name = Utility Events
// #version = 1.0.4
// #date = September 27, 2002
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Callbacks for commonly used, miscellaneous events.
// #status = Release
// #include = support/callback.cs

// ---------------------------------------------------------------------------
// Included callbacks:

// onPlayGuiWake				: called when playGui opens
// onLoadingGuiWake 			: called when loadingGui opens
// onGameGuiWake				: called when gameGui (the join screen) opens
// onChatGuiWake				: called when the IRC gui opens
// onDebriefGuiWake				: called when map summary gui opens
// onScriptBrowserGuiWake		: called when the support script browser opens
// onSetFoV(%fov)				: player Field of View changed. Passes the FoV setting.
// onToggleZoom(%val)			: player toggled zoom on or off
//								:  on or off value in %val (boolean).
// onAmmoHudSetVisible(%val)	: the ammo count display was toggled on or off.
//								:  on or off value in %val (boolean).
// onCmdDisplayHuds				: server sent command for client to display HUDs.
// onCmdToggleHuds(%val)		: server sent commant showing/hiding play HUDs.
//								:  on or off value in %val (boolean).
// onCmdWeaponsHudBitmap		: server send a weapon HUD bitmap name.
//  (%slot, %name, %bitmap)
// onCmdSetWeaponsHudActive		: server sent a command selecting a weapon in the weaponHUD.
// onCmdSetInventoryHud			: server sent an inventory HUD update
//	(%slot, %amount, %addItem)
// onCmdVehicleMount			: player got in a vehicle (see vehicle_callbacks for more
//								:  detailed callbacks).
// preLoadDemoSettings			: called just before settings are loaded for a demo playback
// postLoadDemoSettings			: called just after settings are loaded for a demo playback
// onQuit						: game is about to exit. Can be muted.
// onPreConnect					: called just before a connection to a server is processed
// onPreLocalConnect			: called just before a connection to a listen server is processed
// onDisconnectedCleanup		: cleanup notice when leaving a server
// onUse(%item)					: player issued a "use()" command. Can be muted to stop the function.
// onThrow(%item)				: player issued a "throw()" command. Can be muted to stop the function.
// onUseKit						: player used a repair kit. Can be muted to stop the function.

package EventsPkg {

	//GUI wake events
	function PlayGui::onWake(%this) {

		parent::onWake(%this);
		Callback.trigger("onPlayGuiWake");
	}

	function LoadingGui::onWake(%this) {

		parent::onWake(%this);
		Callback.trigger("onLoadingGuiWake");
	}

	function GameGui::onWake(%this) {

		parent::onWake(%this);
		Callback.trigger("onGameGuiWake");
	}

	function ChatGui::onWake(%this) {

 		parent::onWake(%this);
 		Callback.trigger("onChatGuiWake");
 	}

	function DebriefGui::onWake(%this) {

		parent::onWake(%this);
		Callback.trigger("onDebriefGuiWake");
	}

	function ScriptBrowserGui::onWake(%this) {

		parent::onWake(%this);
 		Callback.trigger("onScriptBrowserGuiWake");
	}

	// FoV
	function setFOV(%fov) {

		parent::setFOV(%fov);
		Callback.trigger("onSetFOV", %fov);
	}

	function toggleZoom(%val) {

		parent::toggleZoom(%val);
		Callback.trigger("onToggleZoom", %val);
	}

	//PlayGui HUD updates
	function ammoHud::setVisible(%this, %val) {

		parent::setVisible(%this, %val);
		Callback.trigger("onAmmoHudSetVisible", %val);
	}

	function clientCmdDisplayHuds() {

		parent::clientCmdDisplayHuds();
		Callback.trigger("onCmdDisplayHuds");
	}

	function clientCmdTogglePlayHuds(%val) {

		parent::clientCmdDisplayHuds();
		Callback.trigger("onCmdToggleHuds", %val);
	}

	function clientCmdSetWeaponsHudBitmap(%slot, %name, %bitmap) {

		parent::clientCmdSetWeaponsHudBitmap(%slot, %name, %bitmap);
		Callback.trigger("onCmdWeaponsHudBitmap", %slot, %name, %bitmap);
	}

	function clientCmdSetWeaponsHudActive(%slot, %ret, %vis) {

		parent::clientCmdSetWeaponsHudActive(%slot, %ret, %vis);
		Callback.trigger("onCmdSetWeaponsHudActive", %slot, %ret, %vis);
	}

	function clientCmdSetInventoryHudItem(%slot, %amount, %addItem) {

		parent::clientCmdSetInventoryHudItem(%slot, %amount, %addItem);
		Callback.trigger("onCmdSetInventoryHud", %slot, %amount, %addItem);
	}

	//Simple vehicle mount
	function clientCmdVehicleMount() {

		parent::clientCmdVehicleMount();
		Callback.trigger("onCmdVehicleMount");
	}

	//Maintenance events
	function loadDemoSettings() {

		Callback.trigger("preLoadDemoSettings");
		parent::loadDemoSettings();
		Callback.trigger("postLoadDemoSettings");
	}

	function quit() {

		Callback.trigger("onQuit");

		if(!Callback.returned("onQuit", mute)) {
			parent::quit();
		}
	}

	function connect(%address, %password, %playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch) {

		Callback.trigger("onPreConnect");
		parent::connect(%address, %password, %playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch);
	}

	function localConnect(%playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch) {

		Callback.trigger("onPreLocalConnect");
		parent::localConnect(%playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch);
	}

	function DisconnectedCleanup() {

		parent::DisconnectedCleanup();
		Callback.trigger("onDisconnectedCleanup");
	}

	// Actions
	function use(%item) {

		Callback.trigger("onUse", %item);

		if(!Callback.returned("onUse", mute)) {
			parent::use(%item);
		}
	}

	function throw(%item) {

		Callback.trigger("onThrow", %item);

		if(!Callback.returned("onThrow", mute)) {
			parent::throw(%item);
		}
	}

	function useRepairKit(%val) {

		Callback.trigger("onUseKit");

		if(!Callback.returned("onUseKit", mute)) {
			parent::useRepairKit(%val);
		}
	}
};

activatePackage(EventsPkg);