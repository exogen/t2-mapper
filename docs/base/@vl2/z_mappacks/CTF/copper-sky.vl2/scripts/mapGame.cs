////////////////////////////////////////////////////////////////////////////////
/// - MAP SUPPORT GAME PACKAGE - ///////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
/// - By Founder, ZOD and TseTse - /////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
/// - Version 2.0 - ////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////

package mapGame
{
   function executeMapScripts()
   {
      echo("<>>>>> ACTIVATING MAP SUPPORT <<<<<>");
      echo("<>>>>>      VERSION 2.0    <<<<<>");
      %path = "missions/mapscripts/*.cs";
      for(%file = findFirstFile( %path ); %file !$= ""; %file = findNextFile( %path ))
         exec(%file);

      $MapScriptsLoaded = 1;
   }

   function getRules()
   {
      // returns the currently executed folder names seperated by ;
      $ModPaths = getModPaths();
      echo($ModPaths);

      // Example Usage (string, start, numChars)
      //if(getSubStr($ModPaths, 0, 6) $= "base++")
      //   %doSomething = false;

      // $arg is the server startup option of "-mod blah" so this will return "blah"
      echo($arg);
      return $arg;
   }

   function killMapPackage(%package)
   {
      deactivatePackage(%package);
   }
};

function loadMapSupport()
{
   if($Host::AllowMapScript $= "" || $Host::AllowMapScript == 1)
   {
      $Host::AllowMapScript = 1;
      if(!isActivePackage(mapGame))
         activatePackage(mapGame);

      if(!$MapScriptsLoaded)
         executeMapScripts();
   }
}

loadMapSupport();

////////////////////////////////////////////////////////////////////////////////
