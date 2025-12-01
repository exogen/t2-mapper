// #autoload
// #name = Bind Manager
// #version = 1.1.1
// #date = September 27, 2002
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Management script for adding new keybinds for Tribes 2 scripts.
// #credit = This script contains code originally written by Wegbert (FixRemap.cs)
// #status = Release
// #include = support/callback.cs
// #include = support/map.cs 1.0.7

// This support function allows user scripts to register new keybinds.
// Usage:
// To add a bind to the moveMap:
// BindManager.addBind( %description, %functionName);
// To add a bind to the obeserverMap:
// BindManager.addObsBind( %description, %functionName);

// %description is the friendly name that will appear in the options dialog's control bind list.
// %functionName is the name of the function to call.
// These map directly to the $RemapName[] and $RemapCmd[] arrays, respectively

if (!isObject(bindManager)) {

	new ScriptObject(bindManager) {
		class = "bindManager";
		obsBinds = Container::newVectorMap();
		mainBinds = Container::newVectorMap();
		vehicleBinds = Container::newVector();
	};
}

function bindManager::addBind(%this, %description, %func, %vehicleCopy) {

	%new = %this.mainBinds.add(%func,%description);

	if (%vehicleCopy && %new) {
		%this.vehicleBinds.pushBack(%func);
	}
}

function bindManager::addObsBind(%this, %description, %func) {

	%this.obsBinds.add(%func,%description);
}

function rebindBrokenMapping(%actionMap, %device, %action, %cmd, %newIndex) {

	%actionMap.bind(%device, %action, %cmd);
	OP_RemapList.setRowById(%newIndex, buildFullMapString(%newIndex ));
}

package BindMgrPkg {

	function OptionsDlg::onWake(%this)	{

		if (isObject(bindManager)) {

			%count = bindManager.mainBinds.size();

			for (%i = 0; %i < %count; %i++) {
				%func = bindManager.mainBinds.keys.valueAt(0);
				%desc = bindManager.mainBinds.value(%func);
				$RemapName[$RemapCount] = %desc;
				$RemapCmd[$RemapCount] = %func;
				$RemapCount++;
				bindManager.mainBinds.remove(%func);
			}

			%count = bindManager.obsBinds.size();

			for (%i = 0; %i < %count; %i++) {
				%func = bindManager.obsBinds.keys.valueAt(0);
				%desc = bindManager.obsBinds.value(%func);
				$ObsRemapName[$ObsRemapCount] = %desc;
				$ObsRemapCmd[$ObsRemapCount] = %func;
				$ObsRemapCount++;
				bindManager.obsBinds.remove(%func);
			}
		}
		parent::onWake(%this);
	}

	function clientCmdSetPilotVehicleKeys() {

		parent::clientCmdSetPilotVehicleKeys();

		%vec = bindManager.vehicleBinds;
		%size = %vec.size();

		for (%x=0; %x < %size; %x++) passengerKeys.copyBind(moveMap,%vec.valueAt(%x));
	}

    function clientCmdSetPassengerVehicleKeys() {

		parent::clientCmdSetPassengerVehicleKeys();

		%vec = bindManager.vehicleBinds;
		%size = %vec.size();

		for (%x=0; %x < %size; %x++) {
			echo(%vec.valueAt(%x));
			passengerKeys.copyBind(moveMap,%vec.valueAt(%x));
		}
	}

	function RemapInputCtrl::onInputEvent(%this, %device, %action) {

		Parent::onInputEvent( %this, %device, %action );

		if (isPackage(FixRemapLoad)) return;

		warn("Remap active");
		if (%this.mode !$= "consoleKey") 	{

			switch$ (OP_ControlsPane.group) {

				case "Observer":
					%actionMap = observerMap;
					%cmd  = $ObsRemapCmd[%this.index];
				default:
					%actionMap = moveMap;
					%cmd  = $RemapCmd[%this.index];
			}

			%prevMap = %actionMap.getCommand( %device, %action );
			if (%prevMap !$= %cmd && %prevMap !$= "") 		{

				%mapName = getMapDisplayName( %device, %action );
				if (%mapName $= "escape") return;

				%prevMapIndex = findRemapCmdIndex( %prevMap );
				if (%prevMapIndex == -1) {

					if (MessageBoxOKDlg.isAwake()) Canvas.popDialog(MessageBoxOKDlg);

					MessageBoxYesNo( "FIXREMAP WARNING",
		                 "\"" @ %mapName @ "\" is bound to the function \"" @ %prevMap @ "\"! The function may exist in a user script. See FixRemap.txt in your T2 autoexec dir for more details. Do you still want to undo this mapping?",
		                 "rebindBrokenMapping(" @ %actionMap @ ", " @ %device @ ", \"" @ %action @ "\", \"" @ %cmd @ "\", " @ %this.index @ ");", "" );
				}
			}
		}
	}
};
activatePackage(BindMgrPkg);
