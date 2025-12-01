//Vehicle Respawn bug fix - Respawn schedules carrying into map changes
package VehicleRespawnFix
{

function VehicleData::respawn(%data, %marker)
{
   if($MatchStarted + $missionRunning == 2 && isObject(%marker))
   {
	   %mask = $TypeMasks::PlayerObjectType | $TypeMasks::VehicleObjectType | $TypeMasks::TurretObjectType;
	   InitContainerRadiusSearch(%marker.getWorldBoxCenter(), %data.checkRadius, %mask);
	   if(containerSearchNext() == 0)    
	   {
		  %newObj = %data.create(%marker.curTeam, %marker);
		  %newObj.startFade(1000, 0, false);
		  %newObj.setTransform(%marker.getTransform());

		  setTargetSensorGroup(%newObj.target, %newObj.team);
		  MissionCleanup.add(%newObj);
	   }
	   else
	   {
		  %marker.schedule = %data.schedule(3000, "respawn", %marker);
	   }
   }
}

function VehicleData::createPositionMarker(%data, %obj)
{
   %marker = new Trigger(PosMarker)
   {
      dataBlock = markerTrigger;
      mountable = %obj.mountable;
      disableMove = %obj.disableMove;
      resetPos = %obj.resetPos;
      data = %obj.getDataBlock().getName();
      deployed = %obj.deployed;
      curTeam = %obj.team;
      respawnTime = %obj.respawnTime;
   };   
   %marker.setTransform(%obj.getTransform());
   MissionCleanup.add(%marker);
   return %marker;
}

};

// Prevent package from being activated if it is already
if (!isActivePackage(VehicleRespawnFix))
    activatePackage(VehicleRespawnFix);