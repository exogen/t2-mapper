// #name = Vehicle Callbacks
// #version = 0.0.5
// #date = June 19, 2001
// #author = Daniel Neilsen (aka Wizard_TPG)
// #credit = Jon 'Ratorasniki' Naiman
// #email = wizardsworld@bigpond.com
// #web = http://www.tribalwar.com/wizard/
// #description = Callbacks for mounting and dismounting vehicles
// #status = release
// #include = support/callback.cs
// ---------------------------------------------------------------------------
//
//	Callbacks included in this script:
//
//	The following callbacks all have the vehicle type as the first variable and the node
//	as the second variable.
//	onShrikePilot
//	onBomberPilot
//	onBomberBomber
//	onBomberTailgunner
//	onHAPCPilot
//	onHAPCPassenger
//	onFLPCPilot
//	onFLPCPassenger
//	onTankGunner
//	onTankDriver
//	onHoverbikeDriver
//	onMPBDriver
//	onHawkeyePilot
//	onHawkeyeGunner
//	onAirVehicle
//	onLandVehicle
//	onPilotingAirVehicle
//	onDrivingLandVehicle
//	onGunningVehicle
//
//  The following callbacks have no variables.
//	onVehicleMount
//	onVehicleDismount
//
//
// 	The following functions are also available for scripters usage:
//		isPlayerMounted();	-	Returns either true or false
//		getCurrentVehicle();-	Returns "Shrike","Hawkeye","Bomber","HAPC","Tank","Bike",
//									"MPB", "FLPC" or ""
//		getCurrentPosition();-	Returns "Pilot", "Gunner", "Passenger" or ""
//
//===================================================================

$VehicleCallback::CurrentMountState = false;
$VehicleCallback::CurrentVehicle = "";
$VehicleCallback::CurrentPosition = "";

package eventcallbacks
{
	function clientCmdShowVehicleGauges(%vehType, %node)
	{
	   	switch$ (%vehType)
	   	{
		  	case "Shrike" :
		   		onShrikePilot(%vehType, %node);
		  	case "Hawkeye" :
			 	if(%node == 1)
			 	{
		   			onHawkeyeGunner(%vehType, %node);
			 	}
			 	else
			 	{
		   			onHawkeyePilot(%vehType, %node);
			 	}
		  	case "Bomber" :
			 	if(%node == 1)
			 	{
		   			onBomberBomber(%vehType, %node);
			 	}
			 	else if(%node == 0)
			 	{
		   			onBomberPilot(%vehType, %node);
			 	}
			 	else
			 	{
		   			onBomberTailgunner(%vehType, %node);
			 	}
		  	case "TACBomber" :
			 	if(%node == 1)
			 	{
		   			onBomberBomber(%vehType, %node);
			 	}
			 	else if(%node == 0)
			 	{
		   			onBomberPilot(%vehType, %node);
			 	}
			 	else
			 	{
		   			onBomberTailgunner(%vehType, %node);
			 	}
		  	case "HAPC" :
			 	if(%node == 0)
			 	{
		   			onHAPCPilot(%vehType, %node);
			 	}
			 	else
			 	{
		   			onHAPCPassenger(%vehType, %node);
			 	}
		  	case "FLPC" :
			 	if(%node == 0)
			 	{
		   			onFLPCPilot(%vehType, %node);
			 	}
			 	else
			 	{
		   			onFLPCPassenger(%vehType, %node);
			 	}
		  	case "Assault" :
				if(%node == 1)
				{
					onTankGunner(%vehType, %node);
				}
				else
				{
					onTankDriver(%vehType, %node);
				}
		  	case "TACAssault" :
				if(%node == 1)
				{
					onTankGunner(%vehType, %node);
				}
				else
				{
					onTankDriver(%vehType, %node);
				}
			case "Hoverbike" :
				onHoverbikeDriver(%vehType, %node);
			case "MPB" :
				onMPBDriver(%vehType, %node);
	 	}
		parent::clientCmdShowVehicleGauges(%vehType, %node);
	}

	function clientCmdSetVWeaponsHudActive(%num, %vType)
	{
		parent::clientCmdSetVWeaponsHudActive(%num, %vType);
		onVehicleMount();
	}

	function clientCmdSetVWeaponsHudClearAll()
	{
		parent::clientCmdSetVWeaponsHudClearAll();
		onVehicleDismount();
	}

	function clientCmdToggleDashHud(%val)
	{
		if(%val)
	 		onVehicleMount();
	 	parent::clientCmdToggleDashHud(%val);
	}

	function clientCmdVehicleDismount()
	{
		parent::clientCmdVehicleDismount();
		onVehicleDismount();
	}

	function clientCmdVehicleMount()
	{
	 	parent::clientCmdVehicleMount();
	 	onVehicleMount();
	}

	function clientCmdSetDefaultVehicleKeys(%inVehicle)
	{
		if(%inVehicle)
			onVehicleMount();
		else
			onVehicleDismount();
		parent::clientCmdSetDefaultVehicleKeys(%inVehicle);
	}
};

activatePackage(eventcallbacks);


function onShrikePilot(%vehType, %node)
{
	callback.trigger(onShrikePilot, %vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Shrike";
	$VehicleCallback::CurrentMountState = true;
	onAirVehicle(%vehType, %node);
	onPilotingAirVehicle(%vehType, %node);
}

function onHawkeyeGunner(%vehType, %node)
{
	callback.trigger(onHawkeyeGunner, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onGunningVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Hawkeye";
	$VehicleCallback::CurrentMountState = true;
}

function onHawkeyePilot(%vehType, %node)
{
	callback.trigger(onHawkeyePilot, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onPilotingAirVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Hawkeye";
	$VehicleCallback::CurrentMountState = true;
}

function onBomberPilot(%vehType, %node)
{
	callback.trigger(onBomberPilot, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onPilotingAirVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Bomber";
	$VehicleCallback::CurrentMountState = true;

}

function onBomberBomber(%vehType, %node)
{
	callback.trigger(onBomberBomber, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onGunningVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Bomber";
	$VehicleCallback::CurrentMountState = true;
}

function onBomberTailgunner(%vehType, %node)
{
	callback.trigger(onBomberTailgunner, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentPosition = "Passenger";
	$VehicleCallback::CurrentVehicle = "Bomber";
	$VehicleCallback::CurrentMountState = true;
}

function onHAPCPilot(%vehType, %node)
{
	callback.trigger(onHAPCPilot, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onPilotingAirVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "HAPC";
	$VehicleCallback::CurrentMountState = true;
}

function onHAPCPassenger(%vehType, %node)
{
	callback.trigger(onHAPCPassenger, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentPosition = "Passenger";
	$VehicleCallback::CurrentVehicle = "HAPC";
	$VehicleCallback::CurrentMountState = true;
}

function onFLPCPilot(%vehType, %node)
{
	callback.trigger(onFLPCPilot, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onPilotingAirVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "FLPC";
	$VehicleCallback::CurrentMountState = true;
}

function onFLPCPassenger(%vehType, %node)
{
	callback.trigger(onFLPCPassenger, %vehType, %node);
	onAirVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentPosition = "Passenger";
	$VehicleCallback::CurrentVehicle = "FLPC";
	$VehicleCallback::CurrentMountState = true;
}

function onTankGunner(%vehType, %node)
{
	callback.trigger(onTankGunner, %vehType, %node);
	onLandVehicle(%vehType, %node);
	onGunningVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Tank";
	$VehicleCallback::CurrentMountState = true;
}

function onTankDriver(%vehType, %node)
{
	callback.trigger(onTankDriver, %vehType, %node);
	onLandVehicle(%vehType, %node);
	onDrivingLandVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Tank";
	$VehicleCallback::CurrentMountState = true;
}

function onHoverbikeDriver(%vehType, %node)
{
	callback.trigger(onHoverbikeDriver, %vehType, %node);
	onLandVehicle(%vehType, %node);
	onDrivingLandVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "Bike";
	$VehicleCallback::CurrentMountState = true;
}

function onMPBDriver(%vehType, %node)
{
	callback.trigger(onMPBDriver, %vehType, %node);
	onLandVehicle(%vehType, %node);
	onDrivingLandVehicle(%vehType, %node);
	onVehicleMount();
	$VehicleCallback::CurrentVehicle = "MPB";
	$VehicleCallback::CurrentMountState = true;
}

function onVehicleDismount()
{
	if(!$VehicleCallback::CurrentMountState)
		return;
	callback.trigger(onVehicleDismount);
	$VehicleCallback::CurrentVehicle = "";
	$VehicleCallback::CurrentPosition = "";
	$VehicleCallback::CurrentMountState = false;
}

function onVehicleMount()
{
	if($VehicleCallback::CurrentMountState)
		return;
	callback.trigger(onVehicleMount);
	$VehicleCallback::CurrentMountState = true;
}

function onAirVehicle(%vehType, %node)
{
	callback.trigger(onAirVehicle, %vehType, %node);
	$VehicleCallback::CurrentMountState = true;
}

function onLandVehicle(%vehType, %node)
{
	callback.trigger(onLandVehicle, %vehType, %node);
	$VehicleCallback::CurrentMountState = true;
}

function onPilotingAirVehicle(%vehType, %node)
{
	callback.trigger(onPilotingAirVehicle, %vehType, %node);
	$VehicleCallback::CurrentPosition = "Pilot";
	$VehicleCallback::CurrentMountState = true;
}

function onDrivingLandVehicle(%vehType, %node)
{
	callback.trigger(onDrivingLandVehicle, %vehType, %node);
	$VehicleCallback::CurrentPosition = "Pilot";
	$VehicleCallback::CurrentMountState = true;
}

function onGunningVehicle(%vehType, %node)
{
	callback.trigger(onGunningVehicle, %vehType, %node);
	$VehicleCallback::CurrentPosition = "Gunner";
	$VehicleCallback::CurrentMountState = true;
}

function isPlayerMounted ()
{
	return $VehicleCallback::CurrentMountState;
}

function getCurrentVehicle()
{
	return $VehicleCallback::CurrentVehicle;
}

function getCurrentPosition()
{
	return $VehicleCallback::CurrentPosition;
}
