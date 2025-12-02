////////////////////////////////////////////////////////////////////////////////
/// - MAP SUPPORT PACKAGE - ////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
/// - By Founder, ZOD and TseTse - /////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
/// - Version 2.0 - ////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

function isActivePackage(%package)
{
   for(%i = 0; %i < $TotalNumberOfPackages; %i++)
   {
      if($Package[%i] $= %package)
      {
         return true;
         break;
      }
   }
   return false;
}

package mapSupportOverloads
{
   function loadMission( %missionName, %missionType, %firstMission )
   {
      Parent::loadMission(%missionName, %missionType, %firstMission);
      if(isPackage(%missionName))
      {
         if(!isActivePackage(%missionName))
            activatePackage(%missionName);

         eval(%missionName @ "::preLoad(%firstMission);");
      }
   }

   function DestroyServer()
   {
      Parent::DestroyServer();
      $MapScriptsLoaded = "";
   }

   function DefaultGame::missionLoadDone(%game)
   {
      Parent::missionLoadDone(%game);
      if(isPackage($MissionName))
      {
         if(!isActivePackage($MissionName))
            activatePackage($MissionName);

         eval($MissionName @ "::InitMap();");
      }    
   }

   function DefaultGame::gameOver( %game )
   {
      Parent::gameOver(%game);
      echo("<>>>>> MAP SUPPORT CLEAN UP <<<<<>");
      if(isPackage($MissionName))
      {
         eval($MissionName @ "::DeactivateMap();");
         killMapPackage($MissionName);
      }
      // ZOD - CTF Game bug fix, thanks to Qing for pointing it out.
      if( Game.campThread_1 !$= "" )
         cancel(Game.campThread_1);

      if( Game.campThread_2 !$= "" )
         cancel(Game.campThread_2);
   }
};

if(($Host::AllowMapScript $= "" || $Host::AllowMapScript == 1) && !isActivePackage(mapSupportGame))
{
   activatePackage(mapSupportOverloads);
}

////////////////////////////////////////////////////////////////////////////////
