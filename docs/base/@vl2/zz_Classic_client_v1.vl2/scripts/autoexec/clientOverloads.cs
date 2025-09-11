////////////////////////////////////////////////////////////////////////////////////////
// z0dd - ZOD: Overloaded base function package ////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

package zzClientOverloads
{
   function clientCmdMissionStartPhase3(%seq, %missionName)
   {
      parent::clientCmdMissionStartPhase3(%seq, %missionName);
      commandToServer('getMod');
   }

   function LobbyGui::onSleep( %this )
   {
      if ( %this.playerDialogOpen )
         LobbyPlayerPopup.forceClose();

      LobbyVoteMenu.clear();
      LobbyVoteMenu.mode = "";
      LobbyCancelBtn.setVisible( false );
      LobbyStatusText.setText( "" );
      $InLobby = false;
      $PrivMsgTarget = "";
   }

   function lobbyReturnToGame()
   {
      Canvas.setContent( PlayGui );
      $PrivMsgTarget = "";
   }

   function LobbyChatEnter::onEscape( %this )
   {
      %this.setValue( "" );
      $PrivMsgTarget = "";
   }

   function LobbyChatEnter::send( %this )
   {
      %text = %this.getValue();
      if ( %text $= "" )
         %text = " ";

      if($PrivMsgTarget !$= "")
      {
         commandToServer('PrivateMessageSent', $PrivMsgTarget, %text);
         $PrivMsgTarget = "";
         %this.setValue( "" );
      }
      else
      {
         commandToServer( 'MessageSent', %text );
         %this.setValue( "" );
      }
   }

   function OptionsDlg::onWake( %this )
   {
      if(!$ClassicHudsBound)
      {
         $RemapName[$RemapCount] = "Toss Repair Kit";
         $RemapCmd[$RemapCount] = "tossRepairKit";
         $RemapCount++;
         $RemapName[$RemapCount] = "Toss Weapon Ammo";
         $RemapCmd[$RemapCount] = "tossAmmo";
         $RemapCount++;
         $RemapName[$RemapCount] = "Toss Mine";
         $RemapCmd[$RemapCount] = "tossMine";
         $RemapCount++;
         $RemapName[$RemapCount] = "Toss Beacon";
         $RemapCmd[$RemapCount] = "tossBeacon";
         $RemapCount++;
         $RemapName[$RemapCount] = "Toss Grenade";
         $RemapCmd[$RemapCount] = "tossGrenade";
         $RemapCount++;
         $RemapName[$RemapCount] = "Max Throw Grenade";
         $RemapCmd[$RemapCount] = "throwGrenadeMax";
         $RemapCount++;
         $RemapName[$RemapCount] = "Max Throw Mine";
         $RemapCmd[$RemapCount] = "throwMineMax";
         $RemapCount++;
         $RemapName[$RemapCount] = "Mod Hud";
         $RemapCmd[$RemapCount] = "toggleModHud";
         $RemapCount++;
         $RemapName[$RemapCount] = "Admin Hud";
         $RemapCmd[$RemapCount] = "toggleAdminHud";
         $RemapCount++;
         $RemapName[$RemapCount] = "Practice Hud";
         $RemapCmd[$RemapCount] = "togglePracticeHud";
         $RemapCount++;
         $ClassicHudsBound = true;
      }
      parent::onWake( %this );
   }

   function clientCmdSetDefaultVehicleKeys(%inVehicle)
   {
      Parent::clientCmdSetDefaultVehicleKeys(%inVehicle);
      if(%inVehicle)
      {
         passengerKeys.copyBind( moveMap, toggleModHud );
         passengerKeys.copyBind( moveMap, toggleAdminHud );
         passengerKeys.copyBind( moveMap, togglePracticeHud );
         passengerKeys.copyBind( moveMap, mouseJet );
         passengerKeys.copyBind( moveMap, throwGrenadeMax );
         passengerKeys.copyBind( moveMap, throwMineMax );
      }
   }

   function clientCmdSetStationKeys(%inStation)
   {
      Parent::clientCmdSetStationKeys(%inStation);
      if ( %inStation )
      {
         stationMap.blockBind( moveMap, toggleModHud );
         stationMap.blockBind( moveMap, toggleAdminHud );
         stationMap.blockBind( moveMap, togglePracticeHud );
      }
   }

   function lobbyVote()
   {
      %id = LobbyVoteMenu.getSelectedId();
      %text = LobbyVoteMenu.getRowTextById( %id );
      switch$ ( LobbyVoteMenu.mode )
      {
         case "":
            switch$ ( $clVoteCmd[%id] )
            {
               case "JoinGame":
                  CommandToServer( 'clientJoinGame' );
                  schedule( 100, 0, lobbyReturnToGame );
                  return;
            
               case "ChooseTeam":
                  commandToServer( 'ClientJoinTeam', -1, true );
                  schedule( 100, 0, lobbyReturnToGame );
                  return;   

               case "VoteTournamentMode":
                  LobbyVoteMenu.tourneyChoose = 1;
                  fillLobbyMissionTypeMenu();
                  return; 
               
               case "VoteMatchStart":
                  startNewVote( "VoteMatchStart" );
                  schedule( 100, 0, lobbyReturnToGame );
                  return;   

               case "MakeObserver":
                  commandToServer( 'ClientMakeObserver' );
                  schedule( 100, 0, lobbyReturnToGame );
                  return;

               case "VoteChangeMission":
                  fillLobbyMissionTypeMenu();
                  return;

               case "VoteChangeTimeLimit":
                  fillLobbyTimeLimitMenu();
                  return;
            
               case "Addbot":
                  commandToServer( 'addBot' );
                  return;

               case "VoteArmorClass":
                  fillLobbyArmorClassMenu();
                  return;

               case "VoteAntiTurtleTime":
                  fillLobbyAntiTurtleMenu();
                  return;
            }
         case "team":
            commandToServer( 'ClientJoinTeam', %id++ );
            LobbyVoteMenu.reset();
            return;

         case "type":
            fillLobbyMissionMenu( $clVoteCmd[%id], %text );
            return;

         case "mission":
            if( !LobbyVoteMenu.tourneyChoose )
            {
               startNewVote( "VoteChangeMission", 
                  %text,                        // Mission display name 
                  LobbyVoteMenu.typeName,       // Mission type display name 
                  $clVoteCmd[%id],              // Mission id                              
                  LobbyVoteMenu.missionType );  // Mission type id
            }
            else
            {
               startNewVote( "VoteTournamentMode", 
                  %text,                        // Mission display name
                  LobbyVoteMenu.typeName,       // Mission type display name
                  $clVoteCmd[%id],              // Mission id
                  LobbyVoteMenu.missionType );  // Mission type id

               LobbyVoteMenu.tourneyChoose = 0;
            }
            LobbyVoteMenu.reset();
            return;

         case "timeLimit":
            startNewVote( "VoteChangeTimeLimit", $clVoteCmd[%id] );
            LobbyVoteMenu.reset();
            return;

         case "armorclass":
            startNewVote( "VoteArmorClass", $clVoteCmd[%id] );
            LobbyVoteMenu.reset();
            return;

         case "antiturtle":
            startNewVote( "VoteAntiTurtleTime", $clVoteCmd[%id] );
            LobbyVoteMenu.reset();
            return;
      }
      startNewVote( $clVoteCmd[%id], $clVoteAction[%id] );
      fillLobbyVoteMenu();
   }

   function LobbyPlayerPopup::onSelect( %this, %id, %text )
   {
      parent::onSelect(%this, %id, %text);
      switch( %id )
      {
         case 12:
            commandToServer('ProcessGameLink', %this.player.clientId);

         case 13:
            commandToServer('WarnPlayer', %this.player.clientId);

         case 14:
            commandToServer('StripAdmin', %this.player.clientId);

         case 15:
            PrivateMessage(%this.player.clientId);
         // From Rapture Admin - MeBad
         case 16:
            commandToServer('PrintClientInfo', %this.player.clientId);

         case 17:
            commandToServer('togglePlayerGag', %this.player.clientId);

         case 18:
            commandToServer('togglePlayerFreeze', %this.player.clientId);

         case 19:
            commandToServer('bootToTheRear', %this.player.clientId);

         case 20:
            commandToServer('explodePlayer', %this.player.clientId);
      }
      Canvas.popDialog( LobbyPlayerActionDlg );
   }

   function VehicleHud::onBuy( %this )
   {
      //toggleCursorHuds( 'vehicleHud' ); // z0dd - ZOD, 5/01/02. Dont close veh station HUD after selecting
      commandToServer( 'buyVehicle', %this.selected );
   }
};

activatePackage(zzClientOverloads);

function fillLobbyArmorClassMenu()
{
   LobbyVoteMenu.key++;
   LobbyVoteMenu.clear();
   LobbyVoteMenu.mode = "armorclass";
   commandToServer( 'GetArmorClassList', LobbyVoteMenu.key );
   LobbyCancelBtn.setVisible( true );
}

function fillLobbyAntiTurtleMenu()
{
   LobbyVoteMenu.key++;
   LobbyVoteMenu.clear();
   LobbyVoteMenu.mode = "antiturtle";
   commandToServer( 'GetAntiTurtleTimeList', LobbyVoteMenu.key );
   LobbyCancelBtn.setVisible( true );
}

function assignMissionType(%msgType, %msgString, %gameType, %a2, %a3, %a4, %a5, %a6)
{
   $thisMissionType = detag(%gameType);
}

function handleStripAdminMsg(%msgType, %msgString, %super, %admin, %client)
{
   %player = $PlayerList[%client];
   if(%player)
   {
      %player.isSuperAdmin = false;
      %player.isAdmin = false;
      lobbyUpdatePlayer(%client);
   }
   alxPlay(AdminForceSound, 0, 0, 0);
}

function clientCmdGetClassicModSettings(%val)
{
   if(%val)
   {
      commandToServer('SetHitSounds', $pref::Classic::playerHitSound, $pref::Classic::playerHitWav,
                                      $pref::Classic::vehicleHitSound, $pref::Classic::vehicleHitWav);
      commandToServer('SetRepairKitWaste', $pref::Classic::wasteRepairKit);
   }
}

function clientCmdTeamDestroyMessage(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6)
{
   if($pref::Classic::ignoreTeamDestroyMessages)
      %msgString = ""; // z0dd - ZOD, 8/23/02. Yogi. The message gets to the client but is "muted" from the HUD
      
   clientCmdServerMessage(%msgType, %msgString, %a1, %a2, %a3, %a4, %a5, %a6);
}

////////////////////////////////////////////////////////////////////////////////////////
// Keybinds ////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function tossAmmo( %val ) { if ( %val ) throw( Ammo ); }
function tossRepairKit( %val ) { if ( %val ) throw( RepairKit ); }
function tossMine( %val ) { if ( %val ) throw( Mine ); }
function tossBeacon( %val ) { if ( %val ) throw( Beacon ); }
function tossGrenade( %val ) { if ( %val ) throw( Grenade ); }

function toggleModHud(%val)
{
   if(%val && $ModHudCreated)
   {
      if($ModHudOpen)
         HideModHud();
      else
         ShowModHud();
   }
}

function toggleAdminHud(%val)
{
   if(%val && $AdminHudCreated)
   {
      if($AdminHudOpen)
         HideAdminHud();
      else
         ShowAdminHud();
   }
}

function togglePracticeHud(%val)
{
   if(%val && $PracticeHudCreated)
   {
      if($practiceHudOpen)
         HidePracticeHud();
      else
         ShowPracticeHud();
   }
}

function throwGrenadeMax( %val )
{
   if(($ServerMod !$= "Classic;base") && ($ServerMod !$= "classic;base"))
      return;

   if ( !%val ) 
   {
      commandToServer( 'throwMaxEnd' );
   }
   $mvTriggerCount4 += $mvTriggerCount4 & 1 == %val ? 2 : 1;
}

function throwMineMax( %val )
{
   if(($ServerMod !$= "Classic;base") && ($ServerMod !$= "classic;base"))
      return;

   if ( !%val )
   {
      commandToServer( 'throwMaxEnd' );
   }
   $mvTriggerCount5 += $mvTriggerCount5 & 1 == %val ? 2 : 1;
}

////////////////////////////////////////////////////////////////////////////////////////
// Grav Cycle Chaingun /////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function clientCmdShowVehicleWeapons(%vehicleType)
{
   switch$ (%vehicleType)
   {
      case "Hoverbike":
         // add right-hand weapons box and highlight
         dashboardHud.weapon = new GuiControl(vWeapHiliteOne) {
            profile = "GuiDashBoxProfile";
            horizSizing = "right";
            vertSizing = "top";
            position = "358 22";
            extent = "80 33";
            minExtent = "8 8";
            visible = "1";

            new HudBitmapCtrl(vWeapBkgdOne) {
               profile = "GuiDashBoxProfile";
               horizSizing = "right";
               vertSizing = "top";
               position = "0 0";
               extent = "82 40";
               minExtent = "8 8";
               bitmap = "gui/hud_veh_new_dashpiece_2";
               visible = "1";
               opacity = "0.8";

               new HudBitmapCtrl(vWeapIconOne) {
                  profile = "GuiDashBoxProfile";
                  horizSizing = "right";
                  vertSizing = "top";
                  position = "28 6";
                  extent = "25 25";
                  minExtent = "8 8";
                  bitmap = "gui/hud_blaster";
                  visible = "1";
                  opacity = "0.8";
               };
            };
         };
         dashboardHud.add(dashboardHud.weapon);
         reticleHud.setBitmap("gui/hud_ret_tankchaingun");
         reticleFrameHud.setVisible(false);

      default:
         return;
   }
}

////////////////////////////////////////////////////////////////////////////////////////
// Projectile Hit Sound defaults ///////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function setupClassicClientDefaults()
{
   if($pref::Classic::wasteRepairKit $="")
   {
      $pref::Classic::wasteRepairKit = 0;
      export( "$pref::*", "prefs/ClientPrefs.cs", False );
   }
   if($pref::Classic::playerHitWav $="")
   { 
      $pref::Classic::playerHitSound = 1; // turns player impact sounds on/off
      $pref::Classic::playerHitWav = "~wfx/weapons/cg_hard4.wav"; // wav file to play when hitting enemy player. base dir is .../audio
      $pref::Classic::vehicleHitSound = 1; // turns vehicle impact sounds on/off
      $pref::Classic::vehicleHitWav = "~wfx/weapons/mine_switch.wav"; // wav file to play when hitting enemy vehicles. base dir is .../audio
      export( "$pref::*", "prefs/ClientPrefs.cs", False );
   }
   if($pref::Classic::ignoreTeamDestroyMessages $="")
   {
      $pref::Classic::ignoreTeamDestroyMessages = 0;
      export( "$pref::*", "prefs/ClientPrefs.cs", False );
   }
}

setupClassicClientDefaults();

////////////////////////////////////////////////////////////////////////////////////////
// Bomber Pilot Hud ////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// Addition to give client bomber reticle when piloting.
package pilotBomberHud
{
   function ClientCmdSetHudMode(%mode, %type, %node)
   {
      parent::clientCmdSetHudMode(%mode, %type, %node);

      if ((%type $= "Bomber") && (%node == 0))
      {
         clientCmdStartBomberSight();
      }
      else if (($typeHolder $= "Bomber") && ($nodeHolder == 0))
      {
         clientCmdEndBomberSight();
      }
      $typeHolder = %type;  
      $nodeHolder = %node;
   }
};

function activateBomberPilotHud(%msgType, %msgString, %gameType, %a2, %a3, %a4, %a5, %a6)
{
   activatePackage(pilotBomberHud);
}

////////////////////////////////////////////////////////////////////////////////////////
// Private messaging ///////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

function PrivateMessage(%clientId)
{
   $PrivMsgTarget = %clientId;
   %notice = "\c2Next message you send will be private to: " @ $PlayerList[%clientId].name;
   addMessageHudLine(%notice);
}

////////////////////////////////////////////////////////////////////////////////////////
// Callbacks ///////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

addMessageCallback('MsgClientReady', assignMissionType);
addMessageCallback('MsgStripAdminPlayer', handleStripAdminMsg);
addMessageCallback('MsgBomberPilotHud', activateBomberPilotHud);

function serverCMDgetMod(%client)
{
   %paths = getModPaths();
   commandToClient(%client, 'serverMod', %paths);
}

function clientCMDserverMod(%value)
{
   $ServerMod = %value;
   if((%value $= "Classic;base") || (%value $= "classic;base"))
   {
      $Camera::movementSpeed = 50;
   }
}