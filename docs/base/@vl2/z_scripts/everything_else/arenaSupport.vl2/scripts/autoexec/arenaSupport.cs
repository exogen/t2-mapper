// #name = Arena Support
// #version = 1.0
// #date = Febuary 19, 2002
// #author = Teribaen
// #warrior = Teribaen
// #email = teribaen@planettribes.com
// #description = Adds an objective HUD and admin commands for the Arena gametype
// #readme = scripts/teribaen/arena_support_info.txt
// #status = Release
// ------------------------------------------------------------------ //

$ArenaSupport::LocalVersion = 1.0;
$ArenaSupport::RemoteVersion = 0;

$ArenaSupport::TeamCount = 2;

// ------------------------------------------------------------------ //
// arenaVersionMsg()
// Recieves version information from the Arena server

function arenaVersionMsg( %msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6 )
{
  %version = detag(%a1);
  %versionString = detag(%a2);
  
  echo( "arenaSupport got remote arena version: "@%versionString@" ("@%version@")" );
  
  $ArenaSupport::RemoteVersion = %version;

  // Put this below the objectiveHud arena label for a few seconds
  objectiveHud.arenaLabel[2].setValue( %versionString );
  $ArenaSupport::versClearSchedule = schedule( 15000, 0, arenaClearVersionBox );
  
  // Respond to the server with our version information
  commandToServer( 'ArenaSupportHello', $ArenaSupport::LocalVersion );
}


// ========================================================================== //
// |                                                                        | //
// |  ARENA HUD                                                             | //
// |                                                                        | //
// ========================================================================== //

// ------------------------------------------------------------------ //
// arenaServerState()
// Receive information about the server setup

function arenaServerState( %msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6 )
{
  %teamCount = detag(%a1);
  
  echo( "arenaSupport got teamCount: "@%teamCount );
    
  $ArenaSupport::TeamCount = %teamCount;
}

// ------------------------------------------------------------------ //
// BEGIN PACKAGE [ ArenaHUD ]
// ------------------------------------------------------------------ //

package ArenaHUD
{

// ------------------------------------------------------------------ //
// setupObjHud()
// On entering a game prepare the objective hud based on the gametype

function setupObjHud( %gameType )
{
  echo( "setupObjHud called for ArenaHUD" );
  
  if ( %gameType $= ArenaGame )
  {
    // Set the dividing lines between controls
    objectiveHud.setSeparators( "48 150 202" );
    objectiveHud.enableHorzSeparator();

    // Arena Label ("ARENA")
    objectiveHud.arenaLabel[1] = new GuiTextCtrl() {
      profile = "GuiTextObjGreenCenterProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "4 3";
      extent = "42 16";
      visible = "1";
      text = "ARENA";
    };
    
    // Arena Version (Just displays a string from server)
    objectiveHud.arenaLabel[2] = new GuiTextCtrl() {
      profile = "GuiTextObjHudCenterProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "4 19";
      extent = "42 16";
      visible = "1";
    };
    
    // Team Names Column
    objectiveHud.teamName[1] = new GuiTextCtrl() {
      profile = "GuiTextObjGreenLeftProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "56 3";
      extent = "90 16";
      visible = "1";
    };
    objectiveHud.teamName[2] = new GuiTextCtrl() {
      profile = "GuiTextObjHudLeftProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "56 19";
      extent = "90 16";
      visible = "1";
    };

    // Team State Column (%alive/%total)
    objectiveHud.arenaState[1] = new GuiTextCtrl() {
      profile = "GuiTextObjGreenCenterProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "156 3";
      extent = "43 16";
      visible = "1";
    };
    objectiveHud.arenaState[2] = new GuiTextCtrl() {
      profile = "GuiTextObjHudCenterProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "156 19";
      extent = "43 16";
      visible = "1";
    };
    
    // Team Scores Column
    objectiveHud.teamScore[1] = new GuiTextCtrl() {
      profile = "GuiTextObjGreenCenterProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "209 3";
      extent = "26 16";
      visible = "1";
    };
    objectiveHud.teamScore[2] = new GuiTextCtrl() {
      profile = "GuiTextObjHudCenterProfile";
      horizSizing = "right";
      vertSizing = "bottom";
      position = "209 19";
      extent = "26 16";
      visible = "1";
    };

    // Add our controls to the parent hud object
    for(%i = 1; %i <= 2; %i++)
    {
      objectiveHud.add( objectiveHud.arenaLabel[%i] );
      objectiveHud.add( objectiveHud.teamName[%i] );
      objectiveHud.add( objectiveHud.arenaState[%i] );
      objectiveHud.add( objectiveHud.teamScore[%i] );
    }
  }
  else
    Parent::setupObjHud( %gameType );
}

// ------------------------------------------------------------------ //
// swapTeamLines()
// Swap the objective hud lines to put the player's team on top

function swapTeamLines()
{
  if ( $ArenaSupport::TeamCount != 2 )
    return;
    
  // Formatting constants
  %bLeft = "GuiTextObjHudLeftProfile";
  %bCenter = "GuiTextObjHudCenterProfile";
  %gLeft = "GuiTextObjGreenLeftProfile";
  %gCenter = "GuiTextObjGreenCenterProfile";
   
  // Swap the vertical positions of the hud lines
  %teamOneY = getWord( objectiveHud.teamName[1].position, 1 );
  %teamTwoY = getWord( objectiveHud.teamName[2].position, 1 );
  
  if(%teamOneY > %teamTwoY)
  {
    // If team one was on the second line, now it'll be on the first
    %newTop = 1;
    %newBottom = 2;
  }
  else
  {
    // If team one was on the first line, now it'll be on the second
    %newTop = 2;
    %newBottom = 1;
  }
   
  // Swap the controls specific to Arena
  if( isObject( objectiveHud.arenaState[1] ) )
  {
    %locatX = firstWord( objectiveHud.arenaState[1].position );
    objectiveHud.arenaState[1].position = %locatX SPC %teamTwoY;
    objectiveHud.arenaState[2].position = %locatX SPC %teamOneY;
    
    // Swap profiles so top line is green (don't bother with labels)
    objectiveHud.arenaState[%newTop].setProfile( %gCenter );
    objectiveHud.arenaState[%newbottom].setProfile( %bCenter );
  }

  // Swap built-in controls
  Parent::swapTeamLines();
}

// ------------------------------------------------------------------ //
// DispatchLaunchMode()
// Use this builtin function to add our callbacks

function DispatchLaunchMode()
{
  echo( "DispatchLaunchMode() adding callbacks for ArenaHUD" );

  addMessageCallback( 'MsgArenaVersion', arenaVersionMsg );
  addMessageCallback( 'MsgArenaServerState', arenaServerState );
  addMessageCallback( 'MsgArenaAddTeam', arenaAddTeam );
  addMessageCallback( 'MsgArenaTeamState', arenaTeamState );
  
  Parent::DispatchLaunchMode();
}

};

// ------------------------------------------------------------------ //
// END PACKAGE [ ArenaHUD ]
// ------------------------------------------------------------------ //


// ------------------------------------------------------------------ //
// arenaAddTeam()
// Add a team to the arena objective hud

function arenaAddTeam( %msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6 )
{
  %teamNum = detag(%a1);
  if ( %teamNum > 2 )
    return;
  
  %teamName = detag(%a2);
  %score = detag(%a3);
  if( %score $= "" )
    %score = 0;
  
  %aliveCount = detag(%a4);
  %totalCount = detag(%a5);
  if( %aliveCount $= "" )
    %aliveCount = 0;
  if( %totalCount $= "" )
    %totalCount = 0;

  if ( $ArenaSupport::TeamCount == 2 )
  {
    objectiveHud.teamName[%teamNum].setValue( %teamName );
    objectiveHud.teamScore[%teamNum].setValue( %score );
    objectiveHud.arenaState[%teamNum].setValue( %aliveCount @ "/" @ %totalCount );
  }
}

// ------------------------------------------------------------------ //
// arenaTeamState()
// Update the alive/total player count for a team on the arena hud

function arenaTeamState( %msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6 )
{
   %teamNum = detag(%a1);
   if ( %teamNum > 2 )
     return;
   
   %aliveCount = detag(%a2);
   %totalCount = detag(%a3);

   if( %aliveCount $= "" )
      %aliveCount = 0;
   if( %totalCount $= "" )
      %totalCount = 0;

   if ( $ArenaSupport::TeamCount == 2 )
     objectiveHud.arenaState[%teamNum].setValue( %aliveCount @ "/" @ %totalCount );
}

// ------------------------------------------------------------------ //
// arenaClearVersionBox()
// Clears the objhud version box (under the arena label)

function arenaClearVersionBox()
{
  objectiveHud.arenaLabel[2].setValue( "" );
}


// ------------------------------------------------------------------ //
// Always execute the ArenaHUD package

activatePackage( ArenaHUD );



// ========================================================================== //
// |                                                                        | //
// |  CONSOLE ADMIN COMMANDS                                                | //
// |                                                                        | //
// ========================================================================== //

// ------------------------------------------------------------------ //
// arenaForceRoundEnd();

function arenaForceRoundEnd( %teamIndex )
{
  if ( %teamIndex $= "" )
    %teamIndex = 0;
    
  commandToServer( 'ArenaForceRoundEnd', %teamIndex );
}

// ------------------------------------------------------------------ //
// arenaSetCurrentRoundLimit();

function arenaSetCurrentRoundLimit( %newRoundLimit )
{
  commandToServer( 'ArenaSetCurrentRoundLimit', %newRoundLimit );
}

// ------------------------------------------------------------------ //
// arenaSetCurrentTimeLimit();

function arenaSetCurrentTimeLimit( %newTimeLimit )
{
  commandToServer( 'ArenaSetCurrentTimeLimit', %newTimeLimit );
}

// ------------------------------------------------------------------ //
// arenaEnableDebugging();

function arenaEnableDebugging()
{
  commandToServer( 'ArenaEnableDebugging' );
}

// ------------------------------------------------------------------ //
// arenaDisableDebugging();

function arenaDisableDebugging()
{
  commandToServer( 'ArenaDisableDebugging' );
}

// ------------------------------------------------------------------ //
// SADsetJoinPassword();

function SADsetJoinPassword( %newPassword )
{
  commandToServer( 'SetJoinPassword', %newPassword );
}



// ========================================================================== //
// |                                                                        | //
// |  VOTING/MENU SUPPORT                                                   | //
// |                                                                        | //
// ========================================================================== //


