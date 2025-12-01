// #autoload
// #name = multiInterpolate
// #config = multiInterpolateOptions

if(isFile("prefs/multiInterpolateprefs.cs")) exec("prefs/multiInterpolateprefs.cs");
exec("gui/multiInterpolateOptions.cs");
exec("scripts/weaponslist.cs");
exec("scripts/vehicleslist.cs");
exec("scripts/turretslist.cs");

package multiInterpolate
{
	function mouseFire(%val)
	{
		parent::mouseFire(%val);
		if(%val)
		{
			$isFiring = 1;
			if($HudMode $= "Standard") loadWeaponInterpolate($CurrWeap);
			else if($HudMode $= "Pilot") loadVehicleInterpolate($HudModeType, $HudModeNode, $HudModeWeapon);
			else if($HudMode $= "Object") loadTurretInterpolate($HudModeType);
			if($DefaultOnFire) loadDefaultInterpolate();
		}
		else
		{
			$isFiring = 0;
			if($HudMode $= "Standard") loadWeaponInterpolate($CurrWeap);
			else if($HudMode $= "Pilot") loadVehicleInterpolate($HudModeType, $HudModeNode, $HudModeWeapon);
			else if($HudMode $= "Object") loadTurretInterpolate($HudModeType);
			if($ChangeOnFire) loadDefaultInterpolate();
		}
	}
	function clientCmdSetWeaponsHudActive(%slot, %ret, %vis)
	{
		Parent::clientCmdSetWeaponsHudActive(%slot, %ret, %vis);
		$CurrWeap = $WeaponNames[%slot];
		loadWeaponInterpolate($CurrWeap);
	}
	function clientCmdSetVWeaponsHudActive(%num, %vType)
	{
		parent::clientCmdSetVWeaponsHudActive(%num, %vType);
		$HudModeWeapon = %num;
		loadVehicleInterpolate($HudModeType, $HudModeNode, $HudModeWeapon);
	}
	function ClientCmdDisplayHuds()
	{
		parent::clientCmdDisplayHuds();
		if($HudMode $= "Object") loadTurretInterpolate($HudModeType);
		else if($HudMode $= "Pilot") loadVehicleInterpolate($HudModeType, $HudModeNode, $HudModeWeapon);
	}
	function quit()
	{
		export("$multiInterpolate::*", "prefs/multiInterpolateprefs.cs", false);
		parent::quit();
	}
};
activatepackage(multiInterpolate);
function loadWeaponInterpolate(%weapon)
{
	if($multiInterpolate::weapon[%weapon] $= "") setInterpolate(%weapon, 0, 30, 3, 0.5, 0, 0);
	$Player::maxLatencyTicks = getword($multiInterpolate::weapon[%weapon], 0);
	$Player::maxPredictionTicks = getword($multiInterpolate::weapon[%weapon], 1);
	$Player::maxWarpTicks = getword($multiInterpolate::weapon[%weapon], 2);
	$Player::minWarpTicks = getword($multiInterpolate::weapon[%weapon], 3);
	$ChangeOnFire = getword($multiInterpolate::weapon[%weapon], 4);
	$DefaultOnFire = getword($multiInterpolate::weapon[%weapon], 5);
	if($ChangeOnFire && !$isFiring) loadDefaultInterpolate();
}
function loadVehicleInterpolate(%vehicle, %node, %weapon)
{
	if(%weapon $= "") %weapon = 1;
	if($multiInterpolate::weapon[%vehicle@%node@%weapon] $= "") setInterpolate(%vehicle@%node@%weapon, 0, 30, 3, 0.5, 0, 0);
	$Player::maxLatencyTicks = getword($multiInterpolate::weapon[%vehicle@%node@%weapon], 0);
	$Player::maxPredictionTicks = getword($multiInterpolate::weapon[%vehicle@%node@%weapon], 1);
	$Player::maxWarpTicks = getword($multiInterpolate::weapon[%vehicle@%node@%weapon], 2);
	$Player::minWarpTicks = getword($multiInterpolate::weapon[%vehicle@%node@%weapon], 3);
	$ChangeOnFire = getword($multiInterpolate::weapon[%vehicle@%node@%weapon], 4);
	$DefaultOnFire = getword($multiInterpolate::weapon[%vehicle@%node@%weapon], 5);
	if($ChangeOnFire && !$isFiring) loadDefaultInterpolate();
}
function loadTurretInterpolate(%turret)
{
	if($multiInterpolate::weapon[%turret] $= "") setInterpolate(%turret, 0, 30, 3, 0.5, 0, 0);
	$Player::maxLatencyTicks = getword($multiInterpolate::weapon[%turret], 0);
	$Player::maxPredictionTicks = getword($multiInterpolate::weapon[%turret], 1);
	$Player::maxWarpTicks = getword($multiInterpolate::weapon[%turret], 2);
	$Player::minWarpTicks = getword($multiInterpolate::weapon[%turret], 3);
	$ChangeOnFire = getword($multiInterpolate::weapon[%turret], 4);
	$DefaultOnFire = getword($multiInterpolate::weapon[%turret], 5);
	if($ChangeOnFire && !$isFiring) loadDefaultInterpolate();
}
function loadDefaultInterpolate()
{
	$Player::maxLatencyTicks = 0;
	$Player::maxPredictionTicks = 30;
	$Player::maxWarpTicks = 3;
	$Player::minWarpTicks = 0.5;
}
function setInterpolate(%weapon, %maxLatency, %maxPrediction, %maxWarp, %minWarp, %change, %def)
{
	if(%maxLatency $= "" || %maxPrediction $= "" || %maxWarp $= "" || %minWarp $= "") return;
	$multiInterpolate::weapon[%weapon] = %maxLatency SPC %maxPrediction SPC %maxWarp SPC %minWarp SPC %change SPC %def;
	maxLatencyTicks.setvalue(getword($multiInterpolate::weapon[%weapon], 0));
	maxPredictionTicks.setvalue(getword($multiInterpolate::weapon[%weapon], 1));
	maxWarpTicks.setvalue(getword($multiInterpolate::weapon[%weapon], 2));
	minWarpTicks.setvalue(getword($multiInterpolate::weapon[%weapon], 3));
	ChangeOnFire.setvalue(getword($multiInterpolate::weapon[%weapon], 4));
	DefaultOnFire.setvalue(getword($multiInterpolate::weapon[%weapon], 5));
}
function multiInterpolateOptions::onWake(%this)
{
	if(!MIN_WeaponsTab.getvalue() && !MIN_VehiclesTab.getvalue() && !MIN_TurretsTab.getvalue())
	{
		MIN_WeaponsTab.setValue(true); 
		MIN_VehiclesTab.setValue(false);
		MIN_TurretsTab.setValue(false);
		multiInterpolateOptions.SelectTab(weapons);
	}
}
function multiInterpolateOptions::SelectTab(%this, %tab)
{
	multiIntPopup.clear();
	if(%tab $= "weapons")
	{
		for(%x = 0; %x < $WeaponsHudCount; %x++) multiIntPopup.add($WeaponsHudData[%x, itemDataName], %x);
		%text = $WeaponsHudData[0, itemDataName];
	}
	else if(%tab $= "vehicles")
	{
		for(%x = 0; %x < $VehiclesHudCount; %x++) multiIntPopup.add($VehiclesHudData[%x, itemGameName], %x);
		%text = $VehiclesHudData[0, itemDataName];
	}
	else if(%tab $= "turrets")
	{
		for(%x = 0; %x < $TurretsHudCount; %x++) multiIntPopup.add($TurretsHudData[%x, itemGameName], %x);
		%text = $TurretsHudData[0, itemDataName];
	}
	multiIntPopup.setSelected(0);
	if($multiInterpolate::weapon[%text] $= "") setInterpolate(%text, 0, 30, 3, 0.5, 0, 0);
	setInterpolate(%text, getword($multiInterpolate::weapon[%text], 0), getword($multiInterpolate::weapon[%text], 1), getword($multiInterpolate::weapon[%text], 2), getword($multiInterpolate::weapon[%text], 3), getword($multiInterpolate::weapon[%text], 4), getword($multiInterpolate::weapon[%text], 5));
}
function multiIntPopup::onSelect(%this, %id, %text)
{
	if(MIN_WeaponsTab.getvalue()) %text = $WeaponsHudData[%id, itemDataName];
	else if(MIN_VehiclesTab.getvalue()) %text = $VehiclesHudData[%id, itemDataName];
	else if(MIN_TurretsTab.getvalue()) %text = $TurretsHudData[%id, itemDataName];
	if($multiInterpolate::weapon[%text] $= "") setInterpolate(%text, 0, 30, 3, 0.5, 0, 0);
	setInterpolate(%text, getword($multiInterpolate::weapon[%text], 0), getword($multiInterpolate::weapon[%text], 1), getword($multiInterpolate::weapon[%text], 2), getword($multiInterpolate::weapon[%text], 3), getword($multiInterpolate::weapon[%text], 4), getword($multiInterpolate::weapon[%text], 5));
}
function multiInterpolateOptions::SetOption(%this, %job)
{
	if(MIN_WeaponsTab.getvalue()) %text = $WeaponsHudData[multiIntPopup.getSelected(), itemDataName];
	else if(MIN_VehiclesTab.getvalue()) %text = $VehiclesHudData[multiIntPopup.getSelected(), itemDataName];
	else if(MIN_TurretsTab.getvalue()) %text = $TurretsHudData[multiIntPopup.getSelected(), itemDataName];
	if(%job $= "new") setInterpolate(%text, maxLatencyTicks.getvalue(), maxPredictionTicks.getvalue(), maxWarpTicks.getvalue(), minWarpTicks.getvalue(), ChangeOnFire.getvalue(), DefaultOnFire.getvalue());
	else if(%job $= "default") setInterpolate(%text, 0, 30, 3, 0.5, 0, 0);
}
