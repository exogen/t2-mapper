// #name = Key Support
// #version = 0.0.2
// #date = April 11, 2001
// #category = Support
// #author = Daniel Neilsen (aka Wizard_TPG)
// #email = wizardsworld@bigpond.com
// #web = http://www.tribalwar.com/wizard/
// #description = Allows multiple uses of one button and button "muting"
// #status = beta
// #include = support/callback.cs
// ---------------------------------------------------------------------------
//
//	Usage Notes and Examples:
//
//	When a button is pressed it calls a particular function.      eg. MouseFire();
//	What this support script does is creates a callback of the same name that passes
//	the %val value as the first variable.
//
//	eg.  To attack to the mousefire command.
//
//	function MyHandleForMouseFire (%val)
//	{
//		if(%val)
//		{
//			//button was pressed
//		}
//		else
//		{
//			//button was released
//		}
//	}
//
//	callback.add(MouseFirePressed, MyHandleForMouseFire);     - note %val will be 1
//	callback.add(MouseFireReleased, MyHandleForMouseFire);    - note %val will be 0
//
//
//	The other useful function this support script performs is key "muting".  Lets
// 	just assume that you wanna use the mousefire(); command but wish to disable its normal
//	properties for pressing the fire button.  You could do this.
//
//	function MyHandleForMouseFire (%val)
//	{
//		if(%val)
//		{
//			//button was pressed
//		}
//		else
//		{
//			//button was released
//		}
//		return mute;
//	}
//
//	callback.add(MouseFirePressed, MyHandleForMouseFire);
//
//
//
//===========================================================================================

package keycallbacks
{
	function moveleft(%val)
	{
		if(keycallbacks.ButtonPress(moveleft, %val))
			parent::moveleft(%val);
	}

	function moveright(%val)
	{
		if(keycallbacks.ButtonPress(moveright, %val))
			parent::moveright(%val);
	}

	function moveforward(%val)
	{
		if(keycallbacks.ButtonPress(moveforward, %val))
			parent::moveforward(%val);
	}

	function movebackward(%val)
	{
		if(keycallbacks.ButtonPress(movebackward, %val))
			parent::movebackward(%val);
	}

	function moveup(%val)
	{
		if(keycallbacks.ButtonPress(moveup, %val))
			parent::moveup(%val);
	}

	function movedown(%val)
	{
		if(keycallbacks.ButtonPress(movedown, %val))
			parent::movedown(%val);
	}

	function turnLeft( %val )
	{
		if(keycallbacks.ButtonPress(turnLeft, %val))
			parent::turnLeft(%val);
	}

	function turnRight( %val )
	{
		if(keycallbacks.ButtonPress(turnRight, %val))
			parent::turnRight(%val);
	}

	function panUp( %val )
	{
		if(keycallbacks.ButtonPress(panUp, %val))
			parent::panUp(%val);
	}

	function panDown( %val )
	{
		if(keycallbacks.ButtonPress(panDown, %val))
			parent::panDown(%val);
	}

	function yaw(%val)
	{
		if(keycallbacks.ButtonPress(yaw, %val))
			parent::yaw(%val);
	}

	function pitch(%val)
	{
		if(keycallbacks.ButtonPress(pitch, %val))
			parent::pitch(%val);
	}

	function toggleDepth(%val)
	{
		if(keycallbacks.ButtonPress(toggleDepth, %val))
			parent::toggleDepth(%val);
	}

	function snLine(%val)
	{
		if(keycallbacks.ButtonPress(snLine, %val))
			parent::snLine(%val);
	}

	function snToggle(%val)
	{
		if(keycallbacks.ButtonPress(snToggle, %val))
			parent::snToggle(%val);
	}

	function pageMessageHudUp( %val )
	{
		if(keycallbacks.ButtonPress(pageMessageHudUp, %val))
			parent::pageMessageHudUp(%val);
	}

	function pageMessageHudDown( %val )
	{
		if(keycallbacks.ButtonPress(pageMessageHudDown, %val))
			parent::pageMessageHudDown(%val);
	}

	function voiceCapture( %val )
	{
		if(keycallbacks.ButtonPress(voiceCapture, %val))
			parent::voiceCapture(%val);
	}

	function prevWeapon( %val )
	{
		if(keycallbacks.ButtonPress(prevWeapon, %val))
			parent::prevWeapon(%val);
	}

	function nextWeapon( %val )
	{
		if(keycallbacks.ButtonPress(nextWeapon, %val))
			parent::nextWeapon(%val);
	}

	function cycleWeaponAxis( %val )
	{
		if(keycallbacks.ButtonPress(cycleWeaponAxis, %val))
			parent::cycleWeaponAxis(%val);
	}

	function cycleNextWeaponOnly( %val )
	{
		if(keycallbacks.ButtonPress(cycleNextWeaponOnly, %val))
			parent::cycleNextWeaponOnly(%val);
	}

	function toggleFreeLook( %val )
	{
		if(keycallbacks.ButtonPress(toggleFreeLook, %val))
			parent::toggleFreeLook(%val);
	}

	function useRepairKit( %val )
	{
		if(keycallbacks.ButtonPress(useRepairKit, %val))
			parent::useRepairKit(%val);
	}

	function useBackPack( %val )
	{
		if(keycallbacks.ButtonPress(useBackPack, %val))
			parent::useBackPack(%val);
	}

	function useFirstWeaponSlot( %val )
	{
		if(keycallbacks.ButtonPress(useFirstWeaponSlot, %val))
			parent::useFirstWeaponSlot(%val);
	}

	function useSecondWeaponSlot( %val )
	{
		if(keycallbacks.ButtonPress(useSecondWeaponSlot, %val))
			parent::useSecondWeaponSlot(%val);
	}

	function useThirdWeaponSlot( %val )
	{
		if(keycallbacks.ButtonPress(useThirdWeaponSlot, %val))
			parent::useThirdWeaponSlot(%val);
	}

	function useFourthWeaponSlot( %val )
	{
		if(keycallbacks.ButtonPress(useFourthWeaponSlot, %val))
			parent::useFourthWeaponSlot(%val);
	}

	function useFifthWeaponSlot( %val )
	{
		if(keycallbacks.ButtonPress(useFifthWeaponSlot, %val))
			parent::useFifthWeaponSlot(%val);
	}

	function useSixthWeaponSlot( %val )
	{
		if(keycallbacks.ButtonPress(useSixthWeaponSlot, %val))
			parent::useSixthWeaponSlot(%val);
	}

	function useBlaster( %val )
	{
		if(keycallbacks.ButtonPress(useBlaster, %val))
			parent::useBlaster(%val);
	}

	function usePlasma( %val )
	{
		if(keycallbacks.ButtonPress(usePlasma, %val))
			parent::usePlasma(%val);
	}

	function useChaingun( %val )
	{
		if(keycallbacks.ButtonPress(useChaingun, %val))
			parent::useChaingun(%val);
	}

	function useDisc( %val )
	{
		if(keycallbacks.ButtonPress(useDisc, %val))
			parent::useDisc(%val);
	}

	function useGrenadeLauncher( %val )
	{
		if(keycallbacks.ButtonPress(useGrenadeLauncher, %val))
			parent::useGrenadeLauncher(%val);
	}

	function useSniperRifle( %val )
	{
		if(keycallbacks.ButtonPress(useSniperRifle, %val))
			parent::useSniperRifle(%val);
	}

	function useELFGun( %val )
	{
		if(keycallbacks.ButtonPress(useELFGun, %val))
			parent::useELFGun(%val);
	}

	function useMortar( %val )
	{
		if(keycallbacks.ButtonPress(useMortar, %val))
			parent::useMortar(%val);
	}

	function useMissileLauncher( %val )
	{
		if(keycallbacks.ButtonPress(useMissileLauncher, %val))
			parent::useMissileLauncher(%val);
	}

	function useTargetingLaser( %val )
	{
		if(keycallbacks.ButtonPress(useTargetingLaser, %val))
			parent::useTargetingLaser(%val);
	}

	function useShockLance( %val )
	{
		if(keycallbacks.ButtonPress(useShockLance, %val))
			parent::useShockLance(%val);
	}

	function throwGrenade( %val )
	{
		if(keycallbacks.ButtonPress(throwGrenade, %val))
			parent::throwGrenade(%val);
	}

	function placeMine( %val )
	{
		if(keycallbacks.ButtonPress(placeMine, %val))
			parent::placeMine(%val);
	}

	function placeBeacon( %val )
	{
		if(keycallbacks.ButtonPress(placeBeacon, %val))
			parent::placeBeacon(%val);
	}

	function throwWeapon( %val )
	{
		if(keycallbacks.ButtonPress(throwWeapon, %val))
			parent::throwWeapon(%val);
	}

	function throwPack( %val )
	{
		if(keycallbacks.ButtonPress(throwPack, %val))
			parent::throwPack(%val);
	}

	function throwFlag( %val )
	{
		if(keycallbacks.ButtonPress(throwFlag, %val))
			parent::throwFlag(%val);
	}

	function resizeChatHud( %val )
	{
		if(keycallbacks.ButtonPress(resizeChatHud, %val))
			parent::resizeChatHud(%val);
	}

	function setZoomFOV(%val)
	{
		if(keycallbacks.ButtonPress(setZoomFOV, %val))
			parent::setZoomFOV(%val);
	}

	function toggleZoom( %val )
	{
		if(keycallbacks.ButtonPress(toggleZoom, %val))
			parent::toggleZoom(%val);
	}

	function toggleInventoryHud( %val )
	{
		if(keycallbacks.ButtonPress(toggleInventoryHud, %val))
			parent::toggleInventoryHud(%val);
	}

	function selectFavorite1( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite1, %val))
			parent::selectFavorite1(%val);
	}

	function selectFavorite2( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite2, %val))
			parent::selectFavorite2(%val);
	}

	function selectFavorite3( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite3, %val))
			parent::selectFavorite3(%val);
	}

	function selectFavorite4( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite4, %val))
			parent::selectFavorite4(%val);
	}

	function selectFavorite5( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite5, %val))
			parent::selectFavorite5(%val);
	}

	function selectFavorite6( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite6, %val))
			parent::selectFavorite6(%val);
	}

	function selectFavorite7( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite7, %val))
			parent::selectFavorite7(%val);
	}

	function selectFavorite8( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite8, %val))
			parent::selectFavorite8(%val);
	}

	function selectFavorite9( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite9, %val))
			parent::selectFavorite9(%val);
	}

	function selectFavorite10( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite10, %val))
			parent::selectFavorite10(%val);
	}

	function selectFavorite11( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite11, %val))
			parent::selectFavorite11(%val);
	}

	function selectFavorite12( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite12, %val))
			parent::selectFavorite12(%val);
	}

	function selectFavorite13( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite13, %val))
			parent::selectFavorite13(%val);
	}

	function selectFavorite14( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite14, %val))
			parent::selectFavorite14(%val);
	}

	function selectFavorite15( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite15, %val))
			parent::selectFavorite15(%val);
	}

	function selectFavorite16( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite16, %val))
			parent::selectFavorite16(%val);
	}

	function selectFavorite17( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite17, %val))
			parent::selectFavorite17(%val);
	}

	function selectFavorite18( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite18, %val))
			parent::selectFavorite18(%val);
	}

	function selectFavorite19( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite19, %val))
			parent::selectFavorite19(%val);
	}

	function selectFavorite20( %val )
	{
		if(keycallbacks.ButtonPress(selectFavorite20, %val))
			parent::selectFavorite20(%val);
	}

	function quickPackRepairPack(%val)
	{
		if(keycallbacks.ButtonPress(quickPackRepairPack, %val))
			parent::quickPackRepairPack(%val);
	}

	function quickPackEnergyPack(%val)
	{
		if(keycallbacks.ButtonPress(quickPackEnergyPack, %val))
			parent::quickPackEnergyPack(%val);
	}

	function quickPackShieldPack(%val)
	{
		if(keycallbacks.ButtonPress(quickPackShieldPack, %val))
			parent::quickPackShieldPack(%val);
	}

	function quickPackCloakPack(%val)
	{
		if(keycallbacks.ButtonPress(quickPackCloakPack, %val))
			parent::quickPackCloakPack(%val);
	}

	function quickPackJammerPack(%val)
	{
		if(keycallbacks.ButtonPress(quickPackJammerPack, %val))
			parent::quickPackJammerPack(%val);
	}

	function quickPackAmmoPack(%val)
	{
		if(keycallbacks.ButtonPress(quickPackAmmoPack, %val))
			parent::quickPackAmmoPack(%val);
	}

	function quickPackSatchelCharge(%val)
	{
		if(keycallbacks.ButtonPress(quickPackSatchelCharge, %val))
			parent::quickPackSatchelCharge(%val);
	}

	function quickPackDeployableStation(%val)
	{
		if(keycallbacks.ButtonPress(quickPackDeployableStation, %val))
			parent::quickPackDeployableStation(%val);
	}

	function quickPackIndoorTurret(%val)
	{
		if(keycallbacks.ButtonPress(quickPackIndoorTurret, %val))
			parent::quickPackIndoorTurret(%val);
	}

	function quickPackOutdoorTurret(%val)
	{
		if(keycallbacks.ButtonPress(quickPackOutdoorTurret, %val))
			parent::quickPackOutdoorTurret(%val);
	}

	function  quickPackMotionSensor(%val)
	{
		if(keycallbacks.ButtonPress(quickPackMotionSensor, %val))
			parent::quickPackMotionSensor(%val);
	}

	function  quickPackPulse(%val)
	{
		if(keycallbacks.ButtonPress(quickPackPulse, %val))
			parent::quickPackPulse(%val);
	}

	function  quickPackMortarBarrel(%val)
	{
		if(keycallbacks.ButtonPress(quickPackMortarBarrel, %val))
			parent::quickPackMortarBarrel(%val);
	}

	function  quickPackElfBarrel(%val)
	{
		if(keycallbacks.ButtonPress(quickPackElfBarrel, %val))
			parent::quickPackElfBarrel(%val);
	}

	function  quickPackAABarrel(%val)
	{
		if(keycallbacks.ButtonPress(quickPackAABarrel, %val))
			parent::quickPackAABarrel(%val);
	}

	function  quickPackPlasmaBarrel(%val)
	{
		if(keycallbacks.ButtonPress(quickPackPlasmaBarrel, %val))
			parent::quickPackPlasmaBarrel(%val);
	}

	function  quickPackMissileBarrel(%val)
	{
		if(keycallbacks.ButtonPress(quickPackMissileBarrel, %val))
			parent::quickPackMissileBarrel(%val);
	}

	function  quickPackFlashGrenade(%val)
	{
		if(keycallbacks.ButtonPress(quickPackFlashGrenade, %val))
			parent::quickPackFlashGrenade(%val);
	}

	function  quickPackConcussionGrenade(%val)
	{
		if(keycallbacks.ButtonPress(quickPackConcussionGrenade, %val))
			parent::quickPackConcussionGrenade(%val);
	}

	function  quickPackGrenade(%val)
	{
		if(keycallbacks.ButtonPress(quickPackGrenade, %val))
			parent::quickPackGrenade(%val);
	}

	function  quickPackFlareGrenade(%val)
	{
		if(keycallbacks.ButtonPress(quickPackFlareGrenade, %val))
			parent::quickPackFlareGrenade(%val);
	}

	function  quickPackCameraGrenade(%val)
	{
		if(keycallbacks.ButtonPress(quickPackCameraGrenade, %val))
			parent::quickPackCameraGrenade(%val);
	}

	function toggleCommanderMap( %val )
	{
		if(keycallbacks.ButtonPress(toggleCommanderMap, %val))
			parent::toggleCommanderMap(%val);
	}

	function report(%val)
	{
		if(keycallbacks.ButtonPress(report, %val))
			parent::report(%val);
	}

	function suicide(%val)
	{
		if(keycallbacks.ButtonPress(suicide, %val))
			parent::suicide(%val);
	}

	function toggleFirstPerson(%val)
	{
		if(keycallbacks.ButtonPress(toggleFirstPerson, %val))
			parent::toggleFirstPerson(%val);
	}

	function toggleCamera(%val)
	{
		if(keycallbacks.ButtonPress(toggltoggleCameraeCommanderMap, %val))
			parent::toggleCamera(%val);
	}

	function dropPlayerAtCamera(%val)
	{
		if(keycallbacks.ButtonPress(dropPlayerAtCamera, %val))
			parent::dropPlayerAtCamera(%val);
	}

	function dropCameraAtPlayer(%val)
	{
		if(keycallbacks.ButtonPress(dropCameraAtPlayer, %val))
			parent::dropCameraAtPlayer(%val);
	}

	function dropPlayerAtCamera(%val)
	{
		if(keycallbacks.ButtonPress(dropPlayerAtCamera, %val))
			parent::dropPlayerAtCamera(%val);
	}

	function togglePlayerRace(%val)
	{
		if(keycallbacks.ButtonPress(togglePlayerRace, %val))
			parent::togglePlayerRace(%val);
	}

	function togglePlayerGender(%val)
	{
		if(keycallbacks.ButtonPress(togglePlayerGender, %val))
			parent::togglePlayerGender(%val);
	}

	function togglePlayerArmor(%val)
	{
		if(keycallbacks.ButtonPress(togglePlayerArmor, %val))
			parent::togglePlayerArmor(%val);
	}

	function jump(%val)
	{
		if(keycallbacks.ButtonPress(jump, %val))
			parent::jump(%val);
	}

	function mouseFire(%val)
	{
		if(keycallbacks.ButtonPress(mouseFire, %val))
			parent::mouseFire(%val);
	}

	function mouseJet(%val)
	{
		if(keycallbacks.ButtonPress(mouseJet, %val))
			parent::mouseJet(%val);
	}

	function altTrigger(%val)
	{
		if(keycallbacks.ButtonPress(altTrigger, %val))
			parent::altTrigger(%val);
	}

	function toggleHelpGui( %val )
	{
		if(keycallbacks.ButtonPress(toggleHelpGui, %val))
			parent::toggleHelpGui(%val);
	}

	function toggleScoreScreen( %val )
	{
		if(keycallbacks.ButtonPress(toggleScoreScreen, %val))
			parent::toggleScoreScreen(%val);
	}

	function toggleHudWaypoints(%val)
	{
		if(keycallbacks.ButtonPress(toggleHudWaypoints, %val))
			parent::toggleHudWaypoints(%val);
	}

	function toggleHudMarkers(%val)
	{
		if(keycallbacks.ButtonPress(toggleHudMarkers, %val))
			parent::toggleHudMarkers(%val);
	}

	function toggleHudTargets(%val)
	{
		if(keycallbacks.ButtonPress(toggleHudTargets, %val))
			parent::toggleHudTargets(%val);
	}

	function toggleHudCommands(%val)
	{
		if(keycallbacks.ButtonPress(toggleHudCommands, %val))
			parent::toggleHudCommands(%val);
	}


	function fnAcceptTask( %val )
	{
		if(keycallbacks.ButtonPress(fnAcceptTask, %val))
			parent::fnAcceptTask(%val);
	}

	function fnDeclineTask( %val )
	{
		if(keycallbacks.ButtonPress(fnDeclineTask, %val))
			parent::fnDeclineTask(%val);
	}

	function fnTaskCompleted( %val )
	{
		if(keycallbacks.ButtonPress(fnTaskCompleted, %val))
			parent::fnTaskCompleted(%val);
	}

	function fnResetTaskList( %val )
	{
		if(keycallbacks.ButtonPress(fnResetTaskList, %val))
			parent::fnResetTaskList(%val);
	}

	function voteYes( %val )
	{
		if(keycallbacks.ButtonPress(voteYes, %val))
			parent::voteYes(%val);
	}

	function voteNo( %val )
	{
		if(keycallbacks.ButtonPress(voteNo, %val))
			parent::voteNo(%val);
	}

	function useWeaponOne(%val)
	{
		if(keycallbacks.ButtonPress(useWeaponOne, %val))
			parent::useWeaponOne(%val);
	}

	function useWeaponTwo(%val)
	{
		if(keycallbacks.ButtonPress(useWeaponTwo, %val))
			parent::useWeaponTwo(%val);
	}

	function useWeaponThree(%val)
	{
		if(keycallbacks.ButtonPress(useWeaponThree, %val))
			parent::useWeaponThree(%val);
	}

	function nextVehicleWeapon(%val)
	{
		if(keycallbacks.ButtonPress(nextVehicleWeapon, %val))
			parent::nextVehicleWeapon(%val);
	}

	function prevVehicleWeapon(%val)
	{
		if(keycallbacks.ButtonPress(prevVehicleWeapon, %val))
			parent::prevVehicleWeapon(%val);
	}

	function cycleVehicleWeapon( %val )
	{
		if(keycallbacks.ButtonPress(cycleVehicleWeapon, %val))
			parent::cycleVehicleWeapon(%val);
	}

	function cycleNextVehicleWeaponOnly( %val )
	{
		if(keycallbacks.ButtonPress(cycleNextVehicleWeaponOnly, %val))
			parent::cycleNextVehicleWeaponOnly(%val);
	}
};

activatepackage(keycallbacks);
//======================================================================

if(!isObject(keycallbacks))
{
    new ScriptObject(keycallbacks)
    {
        class = keycallbacks;
    };
}

function keycallbacks::ButtonPress(%this, %name, %val)
{
	if(%val)
		%callbackdata = %name @ "Pressed";
	else
		%callbackdata = %name @ "Released";
	callback.trigger(%callbackdata, %val);
 	if( !callback.returned(%callbackdata, mute) )
		return true;
	else
		return false;
}
