if ( isObject( moveMap ) )
   moveMap.delete();
new ActionMap(moveMap);

//------------------------------------------------------------------------------
// Utility remap functions:
//------------------------------------------------------------------------------
function ActionMap::copyBind( %this, %otherMap, %command )
{
   if ( !isObject( %otherMap ) )
   {
      error( "ActionMap::copyBind - \"" @ %otherMap @ "\" is not an object!" );
      return;
   }

   %bind = %otherMap.getBinding( %command );
   if ( %bind !$= "" )
   {
      %device = getField( %bind, 0 );
      %action = getField( %bind, 1 );
      %flags = %otherMap.isInverted( %device, %action ) ? "SDI" : "SD";
      %deadZone = %otherMap.getDeadZone( %device, %action );
      %scale = %otherMap.getScale( %device, %action );
      %this.bind( %device, %action, %flags, %deadZone, %scale, %command );
   }
}

//------------------------------------------------------------------------------
function ActionMap::blockBind( %this, %otherMap, %command )
{
   if ( !isObject( %otherMap ) )
   {
      error( "ActionMap::copyBind - \"" @ %otherMap @ "\" is not an object!" );
      return;
   }

   %bind = %otherMap.getBinding( %command );
   if ( %bind !$= "" )
      %this.bind( getField( %bind, 0 ), getField( %bind, 1 ), "" );
}

//------------------------------------------------------------------------------
// NON-REMAPPABLE BINDS:
function escapeFromGame()
{
   if(TaskHudDlg.isVisible())
      showTaskHudDlg(false);

   if ( $currentMissionType $= "SinglePlayer" )
      Canvas.pushDialog( SinglePlayerEscapeDlg );
   else
      Canvas.setContent( LobbyGui );
}

function toggleEditor(%make)
{
   //editor should not be available in the demo version
   if (isDemo())
      return;

   if(%make)
   {
      if(Canvas.getContent() == Editor.getId())
         Editor.close();
      else
         Editor.open();
   }
}

moveMap.bindCmd( keyboard, "escape", "", "escapeFromGame();" );
moveMap.bind( keyboard, "alt e", toggleEditor );

//------------------------------------------------------------------------------
$movementSpeed = 1;
function setSpeed(%speed)
{
   if(%speed)
      $movementSpeed = %speed;
}

function moveleft(%val)
{
   $mvLeftAction = %val;
}

function moveright(%val)
{
   $mvRightAction = %val;
}

function moveforward(%val)
{
   $mvForwardAction = %val;
}

function movebackward(%val)
{
   $mvBackwardAction = %val;
}

function moveup(%val)
{
   $mvUpAction = %val;
}

function movedown(%val)
{
   $mvDownAction = %val;
}

function turnLeft( %val )
{
   $mvYawRightSpeed = %val ? $pref::Input::KeyboardTurnSpeed : 0;
}

function turnRight( %val )
{
   $mvYawLeftSpeed = %val ? $pref::Input::KeyboardTurnSpeed : 0;
}

function panUp( %val )
{
   $mvPitchDownSpeed = %val ? $pref::Input::KeyboardTurnSpeed : 0;
}

function panDown( %val )
{
   $mvPitchUpSpeed = %val ? $pref::Input::KeyboardTurnSpeed : 0;
}

// based on a default camera fov of 90'
function getMouseAdjustAmount(%val)
{
   return(%val * ($cameraFov / 90) * 0.01);
}

function yaw(%val)
{
   $mvYaw += getMouseAdjustAmount(%val);
}

function pitch(%val)
{
   $mvPitch += getMouseAdjustAmount(%val);
}

moveMap.bind( keyboard, s, moveleft );
moveMap.bind( keyboard, f, moveright );
moveMap.bind( keyboard, e, moveforward );
moveMap.bind( keyboard, d, movebackward );

function toggleDepth(%val)
{
   if (%val) {
      $testDepth = !$testDepth;
   }
}

function snLine(%val) { if(%val) snapLine(); }
function snToggle(%val) { if(%val) snapToggle(); }

moveMap.bind( mouse, xaxis, yaw );
moveMap.bind( mouse, yaxis, pitch );
moveMap.bind( keyboard, space, jump );
moveMap.bind( mouse, button0, mouseFire );
moveMap.bind( mouse, button1, mouseJet );
//moveMap.bind( keyboard, "shift a", altTrigger );

//------------------------------------------------------------------------------
// MESSAGE HUD FUNCTIONS:
function pageMessageHudUp( %val )
{
   if ( %val )
      pageUpMessageHud();
}

function pageMessageHudDown( %val )
{
   if ( %val )
      pageDownMessageHud();
}

moveMap.bind( keyboard, "pageUp", pageMessageHudUp );
moveMap.bind( keyboard, "pageDown", pageMessageHudDown );

//------------------------------------------------------------------------------
function voiceCapture( %val )
{
   if ( %val )
      voiceCapStart();
   else
      voiceCapStop();
}

moveMap.bind(keyboard, x, voiceCapture);

//------------------------------------------------------------------------------
// WEAPON CYCLING FUNCTIONS:
function prevWeapon( %val )
{
   if ( %val )
      commandToServer( 'cycleWeapon', "prev" );
}

function nextWeapon( %val )
{
   if ( %val )
      commandToServer( 'cycleWeapon', "next" );
}

function cycleWeaponAxis( %val )
{
   if ( %val < 0 )
      commandToServer( 'cycleWeapon', "next" );
   else
      commandToServer( 'cycleWeapon', "prev" );
}

function cycleNextWeaponOnly( %val )
{
   if ( %val < 0 )
      commandToServer( 'cycleWeapon', "next" );
}

moveMap.bind( keyboard, "shift w", prevWeapon );
moveMap.bind( keyboard, w, nextWeapon );
moveMap.bind( mouse, zaxis, cycleWeaponAxis );

function toggleFreeLook( %val )
{
   if ( %val )
      $mvFreeLook = true;
   else
      $mvFreeLook = false;
}

function useRepairKit( %val )
{
   if ( %val )
      use( RepairKit );
}

function useBackPack( %val )
{
   if ( %val )
      commandToServer( 'startUseBackpack', BackPack );
   else
      commandToServer( 'endUseBackpack', BackPack );     
}

function ServerCmdStartUseBackpack( %client, %data )
{
   %client.deployPack = false;
   %client.getControlObject().use( %data );
}  

function ServerCmdEndUseBackpack( %client )
{
   %client.deployPack = true;
}  

moveMap.bind( keyboard, z, toggleFreeLook );
moveMap.bind( keyboard, q, useRepairKit );
moveMap.bind( keyboard, r, useBackpack );

//------------------------------------------------------------------------------
// WEAPON SLOT SELECTION FUNCTIONS:
function useFirstWeaponSlot( %val )
{
   if ( %val )
      commandToServer( 'selectWeaponSlot', 0 );
}

function useSecondWeaponSlot( %val )
{
   if ( %val )
      commandToServer( 'selectWeaponSlot', 1 );
}

function useThirdWeaponSlot( %val )
{
   if ( %val )
      commandToServer( 'selectWeaponSlot', 2 );
}

function useFourthWeaponSlot( %val )
{
   if ( %val )
      commandToServer( 'selectWeaponSlot', 3 );
}

function useFifthWeaponSlot( %val )
{
   if ( %val )
      commandToServer( 'selectWeaponSlot', 4 );
}

function useSixthWeaponSlot( %val )
{
   if ( %val )
      commandToServer( 'selectWeaponSlot', 5 );
}

moveMap.bind( keyboard, "1",  useFirstWeaponSlot );
moveMap.bind( keyboard, "2",  useSecondWeaponSlot );
moveMap.bind( keyboard, "3",  useThirdWeaponSlot );
moveMap.bind( keyboard, "4",  useFourthWeaponSlot );
moveMap.bind( keyboard, "5",  useFifthWeaponSlot );
moveMap.bind( keyboard, "6",  useSixthWeaponSlot );

//------------------------------------------------------------------------------
// DIRECT WEAPON SELECTION FUNCTIONS:
function useBlaster( %val )
{
   if ( %val )
      use( Blaster );
}

function usePlasma( %val )
{
   if ( %val )
      use( Plasma );
}

function useChaingun( %val )
{
   if ( %val )
      use( Chaingun );
}

function useDisc( %val )
{
   if ( %val )
      use( Disc );
}

function useGrenadeLauncher( %val )
{
   if ( %val )
      use( GrenadeLauncher );
}

function useSniperRifle( %val )
{
   if ( %val )
      use( SniperRifle );
}

function useELFGun( %val )
{
   if ( %val )
      use( ELFGun );
}

function useMortar( %val )
{
   if ( %val )
      use( Mortar );
}

function useMissileLauncher( %val )
{
   if ( %val )
      use( MissileLauncher );
}

function useTargetingLaser( %val )
{
   if ( %val )
      use( TargetingLaser );
}

function useShockLance( %val )
{
   if ( %val )
      use( ShockLance );
}

function throwGrenade( %val )
{
   if ( %val ) 
      commandToServer( 'startThrowCount' );
   else
      commandToServer( 'endThrowCount' );
   $mvTriggerCount4 += $mvTriggerCount4 & 1 == %val ? 2 : 1;
}

function placeMine( %val )
{
      if ( %val )
         commandToServer( 'startThrowCount' );
      else
         commandToServer( 'endThrowCount' );
      $mvTriggerCount5 += $mvTriggerCount5 & 1 == %val ? 2 : 1;
}

function placeBeacon( %val )
{
   if ( %val )
      use( Beacon);
}

moveMap.bind( keyboard, g, throwGrenade );
moveMap.bind( keyboard, b, placeMine );
moveMap.bind( keyboard, h, placeBeacon );
moveMap.bind( keyboard, l, useTargetingLaser );

function throwWeapon( %val )
{
   if ( %val )
      commandToServer( 'throwWeapon' );
}

function throwPack( %val )
{
   if ( %val )
      commandToServer('throwPack');
}

function throwFlag( %val )
{
   // TR2:  Allow variable strength passes
   if (objectiveHud.gameType $= "TR2Game")
   {
      if ( %val )
      {
         doFlagGauge(%val);
         commandToServer( 'startFlagThrowCount' );
         
         // Schedule to remove the HUD in 3 seconds.
         $TR2HideGaugeThread = schedule(2500, 0, "hideFlagGauge");
      }
      else
      {
         cancel($TR2HideGaugeThread);
         commandToServer( 'endFlagThrowCount' );
         
         // If we're still trying to throw it, throw it.  Don't bother trying
         // to remove this to get max toss flag throws...it doesn't work.
         if ($TR2FGaugeThread > 0)
            commandToServer('throwFlag');
         doFlagGauge(%val);
      }

      // What's this global for?
      //$mvTriggerCount6 += $mvTriggerCount6 & 1 == %val ? 2 : 1;
   }
   else if ( %val )
      commandToServer('throwFlag');
}

moveMap.bind( keyboard, "ctrl w", throwWeapon );
moveMap.bind( keyboard, "ctrl r", throwPack );
moveMap.bind( keyboard, "ctrl f", throwFlag );

function resizeChatHud( %val )
{
   if ( %val )
      MainChatHud.nextChatHudLen();
}

moveMap.bind( keyboard, "p", resizeChatHud );

//------------------------------------------------------------------------------
// ZOOM FUNCTIONS:
if($pref::player::currentFOV $= "")
   $pref::player::currentFOV = 45;

function setZoomFOV(%val)
{
   if(%val)
      calcZoomFOV();
}
      
function toggleZoom( %val )
{
   if ( %val )
   {
      if(ZoomHud.isVisible())
      {
         cancel(ZoomHud.hideThread);
         hideZoomHud();
      }
      $ZoomOn = true;
      setFov( $pref::player::currentFOV );
   }
   else
   {
      $ZoomOn = false;
      setFov( $pref::player::defaultFov );
   }
}

moveMap.bind(keyboard, t, setZoomFOV);
moveMap.bind(keyboard, a, toggleZoom);

//------------------------------------------------------------------------------
// INVENTORY FAVORITE FUNCTIONS:
function toggleInventoryHud( %val )
{
   if ( %val )
      toggleCursorHuds('inventoryScreen');
}

function selectFavorite1( %val )
{
   if ( %val )
      loadFavorite( 0, 1 );
}

function selectFavorite2( %val )
{
   if ( %val )
      loadFavorite( 1, 1 );
}

function selectFavorite3( %val )
{
   if ( %val )
      loadFavorite( 2, 1 );
}

function selectFavorite4( %val )
{
   if ( %val )
      loadFavorite( 3, 1 );
}

function selectFavorite5( %val )
{
   if ( %val )
      loadFavorite( 4, 1 );
}

function selectFavorite6( %val )
{
   if ( %val )
      loadFavorite( 5, 1 );
}

function selectFavorite7( %val )
{
   if ( %val )
      loadFavorite( 6, 1 );
}

function selectFavorite8( %val )
{
   if ( %val )
      loadFavorite( 7, 1 );
}

function selectFavorite9( %val )
{
   if ( %val )
      loadFavorite( 8, 1 );
}

function selectFavorite10( %val )
{
   if ( %val )
      loadFavorite( 9, 1 );
}

function selectFavorite11( %val )
{
   if ( %val )
      loadFavorite( 10, 1 );
}

function selectFavorite12( %val )
{
   if ( %val )
      loadFavorite( 11, 1 );
}

function selectFavorite13( %val )
{
   if ( %val )
      loadFavorite( 12, 1 );
}

function selectFavorite14( %val )
{
   if ( %val )
      loadFavorite( 13, 1 );
}

function selectFavorite15( %val )
{
   if ( %val )
      loadFavorite( 14, 1 );
}

function selectFavorite16( %val )
{
   if ( %val )
      loadFavorite( 15, 1 );
}

function selectFavorite17( %val )
{
   if ( %val )
      loadFavorite( 16, 1 );
}

function selectFavorite18( %val )
{
   if ( %val )
      loadFavorite( 17, 1 );
}

function selectFavorite19( %val )
{
   if ( %val )
      loadFavorite( 18, 1 );
}

function selectFavorite20( %val )
{
   if ( %val )
      loadFavorite( 19, 1 );
}

moveMap.bind( keyboard, numpadenter, toggleInventoryHud );
moveMap.bind( keyboard, numpad1, selectFavorite1 );
moveMap.bind( keyboard, numpad2, selectFavorite2 );
moveMap.bind( keyboard, numpad3, selectFavorite3 );
moveMap.bind( keyboard, numpad4, selectFavorite4 );
moveMap.bind( keyboard, numpad5, selectFavorite5 );
moveMap.bind( keyboard, numpad6, selectFavorite6 );
moveMap.bind( keyboard, numpad7, selectFavorite7 );
moveMap.bind( keyboard, numpad8, selectFavorite8 );
moveMap.bind( keyboard, numpad9, selectFavorite9 );
moveMap.bind( keyboard, numpad0, selectFavorite10 );

moveMap.bind( keyboard, "shift numpad1", selectFavorite11 );
moveMap.bind( keyboard, "shift numpad2", selectFavorite12 );
moveMap.bind( keyboard, "shift numpad3", selectFavorite13 );
moveMap.bind( keyboard, "shift numpad4", selectFavorite14 );
moveMap.bind( keyboard, "shift numpad5", selectFavorite15 );
moveMap.bind( keyboard, "shift numpad6", selectFavorite16 );
moveMap.bind( keyboard, "shift numpad7", selectFavorite17 );
moveMap.bind( keyboard, "shift numpad8", selectFavorite18 );
moveMap.bind( keyboard, "shift numpad9", selectFavorite19 );
moveMap.bind( keyboard, "shift numpad0", selectFavorite20 );

moveMap.bind( keyboard, "ctrl numpad0", quickPackEnergyPack );
moveMap.bind( keyboard, "ctrl numpad1", quickPackRepairPack );
moveMap.bind( keyboard, "ctrl numpad2", quickPackShieldPack );
moveMap.bind( keyboard, "ctrl numpad3", quickPackCloakPack );
moveMap.bind( keyboard, "ctrl numpad4", quickPackJammerPack );
moveMap.bind( keyboard, "ctrl numpad5", quickPackAmmoPack );
moveMap.bind( keyboard, "ctrl numpad6", quickPackSatchelCharge );
moveMap.bind( keyboard, "ctrl numpad7", quickPackDeployableStation );
moveMap.bind( keyboard, "ctrl numpad8", quickPackIndoorTurret );
moveMap.bind( keyboard, "ctrl numpad9", quickPackOutdoorTurret );
moveMap.bind( keyboard, "ctrl numpaddivide", quickPackMotionSensor );
moveMap.bind( keyboard, "ctrl numpadmult", quickPackPulse ); 

function quickPackRepairPack(%val)
{
   if(%val)
      addQuickPackFavorite("Repair Pack");
} 

function quickPackEnergyPack(%val)
{
   if(%val)
      addQuickPackFavorite("Energy Pack");
} 

function quickPackShieldPack(%val)
{
   if(%val)
      addQuickPackFavorite("Shield Pack");
} 

function quickPackCloakPack(%val)
{
   if(%val)
      addQuickPackFavorite("Cloak Pack");
} 

function quickPackJammerPack(%val)
{
   if(%val)
      addQuickPackFavorite("Sensor Jammer Pack");
} 

function quickPackAmmoPack(%val)
{
   if(%val)
      addQuickPackFavorite("Ammunition Pack");
} 

function quickPackSatchelCharge(%val)
{
   if(%val)
      addQuickPackFavorite("Satchel Charge");
} 

function quickPackDeployableStation(%val)
{
   if(%val)
      addQuickPackFavorite("Inventory Station");
} 

function quickPackIndoorTurret(%val)
{
   if(%val)
      addQuickPackFavorite("Spider Clamp Turret");
} 

function quickPackOutdoorTurret(%val)
{
   if(%val)
      addQuickPackFavorite("Landspike Turret");
} 

function  quickPackMotionSensor(%val)
{
   if(%val)
      addQuickPackFavorite("Motion Sensor Pack");
}

function  quickPackPulse(%val)
{
   if(%val)
      addQuickPackFavorite("Pulse Sensor Pack");
}

function  quickPackMortarBarrel(%val)
{
   if(%val)
      addQuickPackFavorite("Mortar Turret Barrel");
}

function  quickPackElfBarrel(%val)
{
   if(%val)
      addQuickPackFavorite("ELF Turret Barrel");
}

function  quickPackAABarrel(%val)
{
   if(%val)
      addQuickPackFavorite("AA Turret Barrel");
}

function  quickPackPlasmaBarrel(%val)
{
   if(%val)
      addQuickPackFavorite("Plasma Turret Barrel");
}

function  quickPackMissileBarrel(%val)
{
   if(%val)
      addQuickPackFavorite("Missile Turret Barrel");
}

function  quickPackFlashGrenade(%val)
{
   if(%val)
      addQuickPackFavorite("Whiteout Grenade", grenade);
}

function  quickPackConcussionGrenade(%val)
{
   if(%val)
      addQuickPackFavorite("Concussion Grenade", grenade);
}

function  quickPackGrenade(%val)
{
   if(%val)
      addQuickPackFavorite("Grenade", grenade);
}

function  quickPackFlareGrenade(%val)
{
   if(%val)
      addQuickPackFavorite("Flare Grenade", grenade);
}

function  quickPackCameraGrenade(%val)
{
   if(%val)
      addQuickPackFavorite("Deployable Camera", grenade);
}

moveMap.bind( keyboard, tab, toggleFirstPerson );
moveMap.bind( keyboard, u, ToggleMessageHud );
moveMap.bind( keyboard, y, TeamMessageHud );
moveMap.bind( keyboard, v, activateChatMenuHud );

function toggleCommanderMap( %val )
{
   if ( %val )
   {
      showTaskHudDlg(false);
      CommanderMapGui.toggle();
   }
}

moveMap.bind( keyboard, c, toggleCommanderMap );
moveMap.bind( keyboard, "ctrl k", suicide );

function report(%val)
{
   if(%val)
      commandToServer('report');
}

function suicide(%val)
{
   if (%val)
      commandToServer('suicide');
}

function toggleFirstPerson(%val)
{
   if (%val)
   {
      $firstPerson = !$firstPerson;
      hudFirstPersonToggled();
   }
}   

function toggleCamera(%val)
{
   if (%val)
      commandToServer('ToggleCamera');
}

function dropPlayerAtCamera(%val)
{
   if (%val)
      commandToServer('DropPlayerAtCamera');
}

function dropCameraAtPlayer(%val)
{
   if (%val)
      commandToServer('dropCameraAtPlayer');
}

function dropPlayerAtCamera(%val)
{
   if (%val)
      commandToServer('DropPlayerAtCamera');
}

function togglePlayerRace(%val)
{
   if (%val)
      commandToServer('ToggleRace');
}

function togglePlayerGender(%val)
{
  if (%val)
      commandToServer('ToggleGender');
}

function togglePlayerArmor(%val)
{
   if (%val)
      commandToServer('ToggleArmor');
}

function jump(%val)
{
   //$mvTriggerCount2++;
   $mvTriggerCount2 += (($mvTriggerCount2 & 1) == %val) ? 2 : 1;
}

// moveMap.bind(keyboard, "alt c", playCel);
// moveMap.bind(keyboard, "alt a", toggleArmor);
// moveMap.bind(keyboard, "alt d", playDeath);

//function playCel(%val)
//{
//   if (%val)
//      commandToServer('playCel',%anim);
//}

//function playDeath(%val)
//{
//   if (%val)
//      commandToServer('playDeath',%anim);
//}

function mouseFire(%val)
{
   $mvTriggerCount0 += (($mvTriggerCount0 & 1) == %val) ? 2 : 1;
}

function mouseJet(%val)
{
   $mvTriggerCount3 += (($mvTriggerCount3 & 1) == %val) ? 2 : 1;
}

function altTrigger(%val)
{
   $mvTriggerCount1 += (($mvTriggerCount1 & 1) == %val) ? 2 : 1;
}

function testLOSTarget()
{
   ServerConnection.sendLOSTarget();
   commandToServer('TestLOS');
}

function serverCmdTestLOS(%client)
{
   %client.sendTargetTo(%client);
   %msg = 'This is a simple test.';
   messageClient(%client, 'TestMsg', %msg);
}

//------------------------------------------------------------------------------
function toggleHelpGui( %val )
{
   if ( %val )
      toggleHelpText();
}

function toggleScoreScreen( %val )
{
   if ( %val )
      toggleCursorHuds('scoreScreen');
}

moveMap.bind( keyboard, F1, toggleHelpGui );
moveMap.bind( keyboard, F2, toggleScoreScreen );

//------------------------------------------------------------------------------
// DEMO RECORD FUNCTIONS:
function startRecordingDemo( %val )
{
    if ( %val )
       beginDemoRecord();
}

function stopRecordingDemo( %val )
{
    if ( %val )
       stopDemoRecord();
}

if ( !isDemo() )
{
   moveMap.bind( keyboard, F3, startRecordingDemo );
   moveMap.bind( keyboard, F4, stopRecordingDemo );
}

//------------------------------------------------------------------------------
// NAV HUD DISPLAY FUNCTIONS:
function toggleHudWaypoints(%val)
{ 
   if(%val) 
      navHud.setMarkerTypeVisible(ClientWaypoint, !navHud.isMarkerTypeVisible(ClientWaypoint)); 
}

function toggleHudMarkers(%val)
{ 
   if(%val) 
      navHud.setMarkerTypeVisible(MissionWaypoint, !navHud.isMarkerTypeVisible(MissionWaypoint)); 
}

function toggleHudTargets(%val)
{ 
   if(%val) 
   {
      %visible = navHud.isMarkerTypeVisible(Target);
      PlayGui.beaconsVisible = !%visible;
      navHud.setMarkerTypeVisible(Target, !%visible);
   }
}

function toggleHudCommands(%val)
{
   if(%val) 
   {
      %visible = navHud.isMarkerTypeVisible(PotentialTask);
      navHud.setMarkerTypeVisible(PotentialTask, !%visible);
      navHud.setMarkerTypeVisible(AssignedTask, !%visible);
   }
}

moveMap.bind( keyboard, F6, toggleHudWaypoints );
moveMap.bind( keyboard, F7, toggleHudMarkers );
moveMap.bind( keyboard, F8, toggleHudCommands );
moveMap.bind( keyboard, F9, toggleHudTargets );

//------------------------------------------------------------------------------
// TASK FUNCTIONS:
function fnAcceptTask( %val )
{
   if ( %val )
      clientAcceptCurrentTask();
}

function fnDeclineTask( %val )
{
   if ( %val )
      clientDeclineCurrentTask();
}

function fnTaskCompleted( %val )
{
   if ( %val )
      clientTaskCompleted();
}

function fnResetTaskList( %val )
{
   if ( %val )
      TaskList.reset();
}

// tasks
moveMap.bind( keyboard, n, toggleTaskListDlg );
moveMap.bind( keyboard, "enter", fnAcceptTask );
moveMap.bind( keyboard, "backspace", fnDeclineTask );
moveMap.bind( keyboard, "shift c", fnTaskCompleted );
moveMap.bind( keyboard, "shift x", fnResetTaskList );

// misc:
moveMap.bind( keyboard, "ctrl n", toggleNetDisplayHud );

//------------------------------------------------------------------------------
// VOTING FUNCTIONS:
function voteYes( %val )
{
   if ( %val )
      setPlayerVote( true );
}

function voteNo( %val )
{
   if ( %val )
      setPlayerVote( false );
}

moveMap.bind( keyboard, insert, voteYes );
moveMap.bind( keyboard, delete, voteNo );

///////////////////////
// Observer Keys
///////////////////////
if ( isObject( observerMap ) )
   observerMap.delete();
new ActionMap( observerMap );
observerMap.bind( keyboard, t, moveup );
observerMap.bind( keyboard, b, movedown );
observerMap.bind( keyboard, space, jump );
observerMap.bind( mouse, button0, mouseFire );
observerMap.bind( mouse, button1, mouseJet );

if(!isDemo())
{
   observerMap.copyBind(moveMap, startRecordingDemo);
   observerMap.copyBind(moveMap, stopRecordingDemo);
}

///////////////////////
// Vehicle Keys
///////////////////////
function clientCmdSetWeaponryVehicleKeys()
{
   %bind = moveMap.getBinding( nextWeapon );
   passengerKeys.bind( getField( %bind, 0 ), getField( %bind, 1 ), nextVehicleWeapon );

   %bind = moveMap.getBinding( prevWeapon );
   passengerKeys.bind( getField( %bind, 0 ), getField( %bind, 1 ), prevVehicleWeapon );

   %bind = moveMap.getBinding( cycleWeaponAxis );
   passengerKeys.bind( getField( %bind, 0 ), getField( %bind, 1 ), cycleVehicleWeapon );

   %bind = moveMap.getBinding( cycleNextWeaponOnly );
   passengerKeys.bind( getField( %bind, 0 ), getField( %bind, 1 ), cycleNextVehicleWeaponOnly );

   passengerKeys.bind( keyboard, 1, useWeaponOne );
   passengerKeys.bind( keyboard, 2, useWeaponTwo );
   passengerKeys.bind( keyboard, 3, useWeaponThree );
}

function clientCmdSetPilotVehicleKeys()
{
   passengerKeys.copyBind( moveMap, toggleFirstPerson );
   passengerKeys.copyBind( moveMap, toggleFreeLook );
   passengerKeys.copyBind( moveMap, mouseJet );

   // Use the InvertVehicleYAxis pref:
   if ( $pref::Vehicle::InvertYAxis )
   {
      %bind = moveMap.getBinding( pitch );
      %device = getField( %bind, 0 );
      %action = getField( %bind, 1 );
      %flags = moveMap.isInverted( %device, %action ) ? "SD" : "SDI";
      %deadZone = moveMap.getDeadZone( %device, %action );
      %scale = moveMap.getScale( %device, %action );
      passengerKeys.bind( %device, %action, %flags, %deadZone, %scale, pitch );
   }
}

function clientCmdSetPassengerVehicleKeys()
{
   passengerKeys.copyBind( moveMap, toggleZoom );
   passengerKeys.copyBind( moveMap, setZoomFOV );
   passengerKeys.copyBind( moveMap, toggleScoreScreen );
}
 
function clientCmdSetDefaultVehicleKeys(%inVehicle)
{
   if ( %inVehicle )
   {
      if ( isObject( passengerKeys ) )
      {
         passengerKeys.pop();
         passengerKeys.delete();
      }
      new ActionMap( passengerKeys );

      // Bind all of the movement keys:
      passengerKeys.copyBind( moveMap, moveleft );
      passengerKeys.copyBind( moveMap, moveright );
      passengerKeys.copyBind( moveMap, moveforward );
      passengerKeys.copyBind( moveMap, movebackward );
      passengerKeys.copyBind( moveMap, mouseFire );
      passengerKeys.copyBind( moveMap, yaw );
      passengerKeys.copyBind( moveMap, pitch );
      passengerKeys.copyBind( moveMap, turnLeft );
      passengerKeys.copyBind( moveMap, turnRight );
      passengerKeys.copyBind( moveMap, panUp );
      passengerKeys.copyBind( moveMap, panDown );
      passengerKeys.copyBind( moveMap, jump );
      passengerKeys.copyBind( moveMap, setZoomFOV );
      passengerKeys.copyBind( moveMap, toggleZoom );

      // Copy the joystick binds as well:
      passengerKeys.copyBind( moveMap, joyPitch );
      passengerKeys.copyBind( moveMap, joyYaw );
      passengerKeys.copyBind( moveMap, joystickMoveX );
      passengerKeys.copyBind( moveMap, joystickMoveY );

      // Bind the chat keys as well:
      passengerKeys.copyBind( moveMap, ToggleMessageHud );
      passengerKeys.copyBind( moveMap, TeamMessageHud );
      passengerKeys.copyBind( moveMap, resizeChatHud );
      passengerKeys.copyBind( moveMap, pageMessageHudUp );
      passengerKeys.copyBind( moveMap, pageMessageHudDown );
      passengerKeys.copyBind( moveMap, activateChatMenuHud );
      passengerKeys.copyBind( moveMap, voiceCapture );

      // Miscellaneous other binds:
      passengerKeys.copyBind( moveMap, useBackpack );
      passengerKeys.copyBind( moveMap, useRepairKit );
      passengerKeys.copyBind( moveMap, suicide );
      passengerKeys.copyBind( moveMap, voteYes );
      passengerKeys.copyBind( moveMap, voteNo );
      passengerKeys.copyBind( moveMap, toggleCommanderMap );
      passengerKeys.bindCmd( keyboard, escape, "", "escapeFromGame();" );
      passengerKeys.copyBind( moveMap, toggleHelpGui );
      passengerKeys.copyBind( moveMap, toggleScoreScreen );
      passengerKeys.copyBind( moveMap, toggleNetDisplayHud );

      // Bind the weapon keys as well:
      passengerKeys.copyBind( moveMap, nextWeapon );
      passengerKeys.copyBind( moveMap, prevWeapon );
      passengerKeys.copyBind( moveMap, cycleWeaponAxis );
      passengerKeys.copyBind( moveMap, cycleNextWeaponOnly );

      passengerKeys.copyBind( moveMap, useFirstWeaponSlot );
      passengerKeys.copyBind( moveMap, useSecondWeaponSlot );
      passengerKeys.copyBind( moveMap, useThirdWeaponSlot );
      passengerKeys.copyBind( moveMap, useFourthWeaponSlot );
      passengerKeys.copyBind( moveMap, useFifthWeaponSlot );
      passengerKeys.copyBind( moveMap, useSixthWeaponSlot );

      // Bind individual weapons as well:
      passengerKeys.copyBind( moveMap, useBlaster );
      passengerKeys.copyBind( moveMap, usePlasma );
      passengerKeys.copyBind( moveMap, useChaingun );
      passengerKeys.copyBind( moveMap, useDisc );
      passengerKeys.copyBind( moveMap, useGrenadeLauncher );
      passengerKeys.copyBind( moveMap, useSniperRifle );
      passengerKeys.copyBind( moveMap, useELFGun );
      passengerKeys.copyBind( moveMap, useMortar );
      passengerKeys.copyBind( moveMap, useMissileLauncher );
      passengerKeys.copyBind( moveMap, useTargetingLaser );
      passengerKeys.copyBind( moveMap, useShockLance );
      passengerKeys.copyBind( moveMap, throwGrenade );
      passengerKeys.copyBind( moveMap, placeMine );

      // Bind the command assignment/response keys as well:
      passengerKeys.copyBind( moveMap, toggleTaskListDlg );
      passengerKeys.copyBind( moveMap, fnAcceptTask );
      passengerKeys.copyBind( moveMap, fnDeclineTask );
      passengerKeys.copyBind( moveMap, fnTaskCompleted );
      passengerKeys.copyBind( moveMap, fnResetTaskList );

      // grab the demo recorder binds
      passengerKeys.copyBind( moveMap, startRecordingDemo );
      passengerKeys.copyBind( moveMap, stopRecordingDemo );
   }
   else if ( isObject( passengerKeys ) )
   {
      passengerKeys.pop();
      passengerKeys.delete();
   }
}

function useWeaponOne(%val)
{
   if(%val)
      commandToServer('setVehicleWeapon', 1);
}

function useWeaponTwo(%val)
{
   if(%val)
      commandToServer('setVehicleWeapon', 2);
}

function useWeaponThree(%val)
{
   if(%val)
      commandToServer('setVehicleWeapon', 3);
}

function serverCmdSetVehicleWeapon(%client, %num)
{
   %turret = %client.player.getControlObject();
   if(%turret.getDataBlock().numWeapons < %num)
      return;
   %turret.selectedWeapon = %num;
   
   //%hudNum = %turret.getDataBlock().getHudNum(%num);
   //%client.setVWeaponsHudActive(%hudNum);
   %client.setVWeaponsHudActive(%num);

   // set the active image on the client's obj
   if(%num == 1)
      %client.setObjectActiveImage(%turret, 2);
   else if(%num == 2)
      %client.setObjectActiveImage(%turret, 4);
   else
      %client.setObjectActiveImage(%turret, 6);

   // if firing then set the proper image trigger
   if(%turret.fireTrigger)
   {
      if(%num == 1)
      {
         %turret.setImageTrigger(4, false);
         if(%turret.getImageTrigger(6))
         {
            %turret.setImageTrigger(6, false);
            ShapeBaseImageData::deconstruct(%turret.getMountedImage(6), %turret);
         }
         %turret.setImageTrigger(2, true);
      }
      else if( %num == 2)
      {
         %turret.setImageTrigger(2, false);
         if(%turret.getImageTrigger(6))
         {
            %turret.setImageTrigger(6, false);
            ShapeBaseImageData::deconstruct(%turret.getMountedImage(6), %turret);
         }
         %turret.setImageTrigger(4, true);
      }            
      else
      {
         %turret.setImageTrigger(2, false);
         %turret.setImageTrigger(4, false);
      }                                   
   }   
}

function nextVehicleWeapon(%val)
{
   if ( %val )
      commandToServer('switchVehicleWeapon', "next");
}

function prevVehicleWeapon(%val)
{
   if ( %val )
      commandToServer('switchVehicleWeapon', "prev");
}

function cycleVehicleWeapon( %val )
{
   if ( %val < 0 )
      commandToServer( 'switchVehicleWeapon', "next" );
   else
      commandToServer( 'switchVehicleWeapon', "prev" );
}

function cycleNextVehicleWeaponOnly( %val )
{
   if ( %val < 0 )
      commandToServer( 'switchVehicleWeapon', "next" );
}

function serverCmdSwitchVehicleWeapon(%client, %dir)
{
   %turret = %client.player.getControlObject();
   %weaponNum = %turret.selectedWeapon;
   if(%dir $= "next")
   {
      if(%weaponNum++ > %turret.getDataBlock().numWeapons)
         %weaponNum = 1;
   }
   else
   {
      if(%weaponNum-- < 1)
         %weaponNum = %turret.getDataBlock().numWeapons;
   }
   serverCmdSetVehicleWeapon(%client, %weaponNum);
}


///////////////////////
//Station
///////////////////////
function clientCmdSetStationKeys(%inStation)
{
   if ( %inStation )
   {
      if ( isObject( stationMap ) )
      {
         stationMap.pop();
         stationMap.delete(); 
      }
      new ActionMap( stationMap );
      stationMap.blockBind( moveMap, toggleInventoryHud );
      stationMap.bind( keyboard, escape, "" );
      stationMap.push();
   }
   else if ( isObject( stationMap ) )
   {
      stationMap.pop();
      stationMap.delete(); 
   }
}

$MFDebugRenderMode = 0;
function cycleDebugRenderMode()
{
   if($MFDebugRenderMode == 0)
   {
      show();
      GLEnableOutline(true);
      $MFDebugRenderMode = 1;
   }
   else if ($MFDebugRenderMode == 1)
   {
      GLEnableOutline(false);
      setInteriorRenderMode(7);
      $MFDebugRenderMode = 2;
   }
   else if ($MFDebugRenderMode == 2)
   {
      setInteriorRenderMode(0);
      GLEnableOutline(false);
      showTri();
      $MFDebugRenderMode = 0;
   }
}

// Since the toggle console key is remappable, put it here:
if (!isDemo())
   GlobalActionMap.bind(keyboard, "grave", toggleConsole);
