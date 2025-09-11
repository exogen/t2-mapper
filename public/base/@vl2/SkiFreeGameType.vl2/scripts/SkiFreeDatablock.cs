// SkiFreeDatablock.cs
// contains datablocks for SkiFree gametype

// datablocks should only load once
if( !isObject(SkiFreeGateField) ) {

	// special gate - gives an ugly white complexion - they look weird when you aren't playing so i assume nobody will actually use them in maps...
	datablock ForceFieldBareData(SkiFreeGateField) : defaultAllSlowFieldBare {
		fadeMS           = 1000;
		baseTranslucency = 1.0; // if you were close enough to watch, it would look pretty cool, but you're not
		powerOffTranslucency = 0.2;
		powerOffColor    = "1.0 1.0 1.0";

		scrollSpeed = 1;
	};

	// decorative gates
	datablock ForceFieldBareData(SkiFreeGateField1) : SkiFreeGateField {
		powerOffColor = "1 0 0";
	};
	datablock ForceFieldBareData(SkiFreeGateField2) : SkiFreeGateField {
		powerOffColor = "1 0.5 0";
	};
	datablock ForceFieldBareData(SkiFreeGateField3) : SkiFreeGateField {
		powerOffColor = "1 1 0";
	};
	datablock ForceFieldBareData(SkiFreeGateField4) : SkiFreeGateField {
		powerOffColor = "0 1 0";
	};
	datablock ForceFieldBareData(SkiFreeGateField5) : SkiFreeGateField {
		powerOffColor = "0 0 1";
	};
	datablock ForceFieldBareData(SkiFreeGateField6) : SkiFreeGateField {
		powerOffColor = "0.5 0 1";
	};
	datablock ForceFieldBareData(SkiFreeGateField7) : SkiFreeGateField {
		powerOffColor = "1 0 1";
	};

	// triggers needed for game
	datablock TriggerData(SkiFreeTriggerSpawn) {
		tickPeriodMS = 50;
	};

	datablock TriggerData(SkiFreeTriggerGate) {
		tickPeriodMS = 50;
	};
	
	// you can't just summon an explosion; you need to blow something up. an overridden satchel charge will be blown up when i need an explosion
	datablock ItemData(SatchelChargeDeadstop) : SatchelChargeThrown
	{
	   explosion = VehicleBombExplosion;
	   underwaterExplosion = VehicleBombExplosion;
	   maxDamage = 0.1;
	   kickBackStrength = 0;
	   armDelay = 1;
	   computeCRC = false;
	};

	// SkiFreeSpawnPlatform just explodes into a platform (though i didn't use the actual object wired to explode, that would just be tacky)
	datablock StaticShapeData(SkiFreeSpawnPlatform) {
		catagory = "SkiFree Objects";
		className = "Spawn Platform";
		isInvincible = true;
		needsNoPower = true;
		alwaysAmbient = true;
		shapeFile = "beacon.dts";
	};

	datablock StaticShapeData(SkiFreeCustomGate) {
		catagory = "SkiFree Objects";
		className = "Gate Marker";
		isInvincible = true;
		needsNoPower = true;
		alwaysAmbient = true;
		shapeFile = "beacon.dts";
	};

	datablock StaticShapeData(SkiFreeMapConverter) {
		catagory = "SkiFree Objects";
		className = "Map Converter";
		isInvincible = true;
		needsNoPower = true;
		alwaysAmbient = true;
		shapeFile = "beacon.dts";
	};

}

function SkiFreeTriggerSpawn::onEnterTrigger(%this, %trigger, %player) {
	if( !$missionRunning ) return; // this check is needed so it doesn't call this at end of mission
	if( Game.class $= "SkiFreeGame" )
		Game.enterSpawnTrigger(%player);
}

function SkiFreeTriggerSpawn::onTickTrigger(%this, %trigger) {
	// who dat
}

function SkiFreeTriggerSpawn::onLeaveTrigger(%this, %trigger, %player) {
	if( !$missionRunning ) return; // this check is needed so it doesn't call this at end of mission
	if( Game.class $= "SkiFreeGame" )
		Game.leaveSpawnTrigger(%player);
}

function SkiFreeTriggerGate::onEnterTrigger(%this, %trigger, %player) {
	if( !$missionRunning ) return; // this check is needed so it doesn't call this at end of mission
	if( Game.class $= "SkiFreeGame" )
		Game.enterGateTrigger(%trigger, %player);
}

function SkiFreeTriggerGate::onTickTrigger(%this, %trigger) {
	// it's dat boi
}

function SkiFreeTriggerGate::onLeaveTrigger(%this, %trigger, %player) {
	// o shit wut up
}

function SatchelChargeDeadstop::onCollision(%data,%obj,%col) {
	// please don't try to pick up the exploding bomb, even if it's only decorative
}

function SkiFreeSpawnPlatform::onAdd(%this, %obj) {
	// come back when we know where this object is
	%this.schedule(0, doAdd, %obj);
}

function SkiFreeSpawnPlatform::doAdd(%this, %obj) {
	// delete SpawnPlatform from MissionCleanup
	if( isObject(SpawnPlatform) ) {
		for( %i = 0; %i < MissionCleanup.getCount(); %i++ ) {
			if( MissionCleanup.getObject(%i) == nameToID(SpawnPlatform) ) {
				SpawnPlatform.delete();
				break;
			}
		}
	}
	
	if( !isObject(SpawnPlatform) ) {
		%spawnPlatform = new InteriorInstance("SpawnPlatform") {
			position = %obj.position;
			rotation = "1 0 0 0";
			scale = "3 3 3";
			interiorFile = "bwall4.dif";
			showTerrainInside = "0";
		};
		MissionGroup.add(%spawnPlatform);
	}
	else {
		messageAll(0, "~wfx/powered/station_denied.wav");
	}
	
	%obj.delete();
}

function SkiFreeCustomGate::onAdd(%this, %obj) {
	Parent::onAdd(%this, %obj);
	
	%obj.target = ""; // we don't need a target
	
	if( %obj.gateNum__ $= "" ) {
		// automatically add dynamic fields if they aren't there
		if( %obj.gateNum__ $= "" ) %obj.gateNum__ = 0;
		if( %obj.isFinish__ $= "" )%obj.isFinish__ = 0;
	}
}

function SkiFreeMapConverter::onAdd(%this, %obj) {
	%convert = false;
	// check spawnplatform - if it's not in missioncleanup, this is a misclick
	if( isObject(SpawnPlatform) ) {
		for( %i = 0; %i < MissionCleanup.getCount(); %i++ ) {
			if( MissionCleanup.getObject(%i) == nameToID(SpawnPlatform) ) {
				%convert = true;
				break;
			}
		}
	}
	
	if( !%convert ) {
		messageAll(0, "~wfx/powered/station_denied.wav");
	}
	else {
		// move the spawn platform into MissionGroup
		MissionGroup.add(SpawnPlatform);
		
		// go find the gates
		for( %i = 1; %i < 420; %i++ ) {
			%gate = nameToID("GatePoint" @ %i);
			
			if( !isObject(%gate) ) {
				if( %i == 1 ) {
					messageAll(0, "~wfx/powered/station_denied.wav");
				}
				else {
					%newObj.isFinish__ = "1";
				}
				break;
			}

			%gatePos = getWords(%gate.position, 0, 1) SPC (getWord(%gate.position,2) - 25);
			
			%newObj = new StaticShape() {
				position = %gatePos;
				rotation = "1 0 0 0";
				scale = "1 1 1";
				dataBlock = "SkiFreeCustomGate";
				lockCount = "0";
				homingCount = "0";

				gateNum__ = %i;
				isFinish__ = "0";
			};
			MissionGroup.add(%newObj);
		}
	}
	
	%obj.schedule(0, delete);
}	