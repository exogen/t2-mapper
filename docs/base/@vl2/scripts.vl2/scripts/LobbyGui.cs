//------------------------------------------------------------------------------
//
// LobbyGui.cs
//
//------------------------------------------------------------------------------

$InLobby = false;

//------------------------------------------------------------------------------
function LobbyGui::onAdd( %this )
{
   // Add the Player popup menu:
   new GuiControl(LobbyPlayerActionDlg) {
      profile = "GuiModelessDialogProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      setFirstResponder = "0";
      modal = "1";

      new ShellPopupMenu( LobbyPlayerPopup ) {
         profile = "ShellPopupProfile";
         position = "0 0";
         extent = "0 0";
         minExtent = "0 0";
         visible = "1";
         maxPopupHeight = "200";
         noButtonStyle = "1";
      };
   };
}

//------------------------------------------------------------------------------
function LobbyGui::onWake( %this )
{
   if ( !%this.initialized )
   {
      LobbyPlayerList.setSortColumn( $pref::Lobby::SortColumnKey );
      LobbyPlayerList.setSortIncreasing( $pref::Lobby::SortInc );

      %this.initialized = true;
   }

   $InLobby = true;

	//pop any key maps
   moveMap.pop();
   if ( isObject( passengerkeys ) )
	   passengerKeys.pop();
   if ( isObject( observerBlockMap ) )
      observerBlockMap.pop();
   if ( isObject( observerMap ) )
      observerMap.pop();

   $enableDirectInput = "0";
   deactivateDirectInput();

   LobbyMessageVector.attach(HudMessageVector);
   LobbyMessageScroll.scrollToBottom();
   updateLobbyPlayerList();

   LobbyServerName.setText( $clServerName );

   %headerStyle = "<font:" @ $ShellLabelFont @ ":" @ $ShellFontSize @ "><color:00DC00>";
   %statusText = "<spop><spush>" @ %headerStyle @ "MISSION TYPE:<spop>" SPC $clMissionType 
         NL "<spush>" @ %headerStyle @ "MISSION:<spop>" SPC $clMissionName
         NL "<spush>" @ %headerStyle @ "OBJECTIVES:<spop>";

   for ( %line = 0; %this.objLine[%line] !$= ""; %line++ )
      %statusText = %statusText NL "<lmargin:10>* <lmargin:24>" @ %this.objLine[%line];

   LobbyStatusText.setText( %statusText );

   fillLobbyVoteMenu();
}

//------------------------------------------------------------------------------
function LobbyGui::onSleep( %this )
{
   if ( %this.playerDialogOpen )
      LobbyPlayerPopup.forceClose();

   LobbyVoteMenu.clear();
   LobbyVoteMenu.mode = "";
   LobbyCancelBtn.setVisible( false );
   LobbyStatusText.setText( "" );
   $InLobby = false;
}

//------------------------------------------------------------------------------
function lobbyDisconnect()
{
   MessageBoxYesNo( "CONFIRM", "Are you sure you want to leave this game?", "lobbyLeaveGame();", "" );
}

//------------------------------------------------------------------------------
function lobbyLeaveGame()
{
   Canvas.popDialog( LobbyGui );
   Disconnect();
}

//------------------------------------------------------------------------------
function lobbyReturnToGame()
{
   Canvas.setContent( PlayGui );
}

//------------------------------------------------------------------------------
function LobbyChatEnter::onEscape( %this )
{
   %this.setValue( "" );
}

//------------------------------------------------------------------------------
function LobbyChatEnter::send( %this )
{
   %text = %this.getValue();
   if ( %text $= "" )
      %text = " ";
   commandToServer( 'MessageSent', %text );
   %this.setValue( "" );
}

//------------------------------------------------------------------------------
function LobbyPlayerList::initColumns( %this )
{
   %this.clear();
   %this.clearColumns();
   %this.addColumn( 0, " ", 24, 24, 24, "center" );   // Flag column
   %this.addColumn( 6, "lobby_headset", 36, 36, 36, "headericon" );   // Voice Com column
   %this.addColumn( 1, "Player", $pref::Lobby::Column1, 50, 200 );
   if ( $clTeamCount > 1 )
      %this.addColumn( 2, "Team", $pref::Lobby::Column2, 50, 200 );
   %this.addColumn( 3, "Score", $pref::Lobby::Column3, 25, 200, "numeric center" );
   %this.addColumn( 4, "Ping", $pref::Lobby::Column4, 25, 200, "numeric center" );
   %this.addColumn( 5, "PL", $pref::Lobby::Column5, 25, 200, "numeric center" );

   commandToServer( 'getScores' );
}

//------------------------------------------------------------------------------
function LobbyPlayerList::onColumnResize( %this, %col, %size )
{
   $pref::Lobby::Column[%this.getColumnKey( %col )] = %size;
}

//------------------------------------------------------------------------------
function LobbyPlayerList::onSetSortKey( %this, %key, %increasing )
{
   $pref::Lobby::SortColumnKey = %key;
   $pref::Lobby::SortInc = %increasing;
}

//------------------------------------------------------------------------------
function updateLobbyPlayerList()
{
   if ( $InLobby )
   {
      // Let the server know we want an update:
      commandToServer( 'getScores' );
      schedule( 4000, 0, updateLobbyPlayerList );
   }
}

//------------------------------------------------------------------------------
function lobbyUpdatePlayer( %clientId )
{
   %player = $PlayerList[%clientId];
   if ( !isObject( %player ) )
   {
      warn( "lobbyUpdatePlayer( " @ %clientId @ " ) - there is no client object with that id!" );
      return;
   }

   // Build the text:
   if ( %player.isSuperAdmin )
      %tag = "SA";
   else if ( %player.isAdmin )
      %tag = "A";
   else if ( %player.isBot )
      %tag = "B";
   else
      %tag = " ";

   if ( %player.canListen )
   {
      if ( %player.voiceEnabled )
      {
         %voiceIcons = "lobby_icon_speak";
         if ( %player.isListening )
            %voiceIcons = %voiceIcons @ ":lobby_icon_listen";
      }
      else
         %voiceIcons = %player.isListening ? "lobby_icon_listen" : "";
   }
   else
      %voiceIcons = "shll_icon_timedout";

   if ( $clTeamCount > 1 )
   {
      if ( %player.teamId == 0 )
         %teamName = "Observer";
      else
         %teamName = $clTeamScore[%player.teamId, 0] $= "" ? "-" : $clTeamScore[%player.teamId, 0];
      %text = %tag TAB %voiceIcons TAB %player.name TAB %teamName TAB %player.score TAB %player.ping TAB %player.packetLoss;
   }
   else
      %text = %tag TAB %voiceIcons TAB %player.name TAB %player.score TAB %player.ping TAB %player.packetLoss;

   if ( LobbyPlayerList.getRowNumById( %clientId ) == -1 )
      LobbyPlayerList.addRow( %clientId, %text );
   else
      LobbyPlayerList.setRowById( %clientId, %text );

   if ( $InLobby )
      LobbyPlayerList.sort();
}

//------------------------------------------------------------------------------
function lobbyRemovePlayer( %clientId )
{
   LobbyPlayerList.removeRowById( %clientId );
}

//------------------------------------------------------------------------------
function LobbyPlayerList::onRightMouseDown( %this, %column, %row, %mousePos )
{
   // Open the action menu:
   %clientId = %this.getRowId( %row );
   LobbyPlayerPopup.player = $PlayerList[%clientId];

   if ( LobbyPlayerPopup.player !$= "" )
   {
      LobbyPlayerPopup.position = %mousePos;
      Canvas.pushDialog( LobbyPlayerActionDlg );
      LobbyPlayerPopup.forceOnAction();
   }
}

//------------------------------------------------------------------------------
function LobbyPlayerActionDlg::onWake( %this )
{
   LobbyGui.playerDialogOpen = true;
   fillPlayerPopupMenu();
}

//------------------------------------------------------------------------------
function LobbyPlayerActionDlg::onSleep( %this )
{
   LobbyGui.playerDialogOpen = false;
}

//------------------------------------------------------------------------------
function LobbyPlayerPopup::onSelect( %this, %id, %text )
{
//the id's for these are used in DefaultGame::sendGamePlayerPopupMenu()...
//mute:				1
//admin:				2
//kick:				3
//ban:				4
//force observer:	5
//switch team:		6

   switch( %id )
   {
      case 1:  // Mute/Unmute
			togglePlayerMute(%this.player.clientId);
      
      case 2:  // Admin
         MessageBoxYesNo( "CONFIRM", "Are you sure you want to make " @ %this.player.name @ " an admin?", 
               "lobbyPlayerVote( VoteAdminPlayer, \"ADMIN player\", " @ %this.player.clientId @ " );" );
      
      case 3:  // Kick
         MessageBoxYesNo( "CONFIRM", "Are you sure you want to kick " @ %this.player.name @ "?",
               "lobbyPlayerVote( VoteKickPlayer, \"KICK player\", " @ %this.player.clientId @ " );" );
      
      case 4:  // Ban
         MessageBoxYesNo( "CONFIRM", "Are you sure you want to ban " @ %this.player.name @ "?",
               "lobbyPlayerVote( BanPlayer, \"BAN player\", " @ %this.player.clientId @ " );" );

      case 5: // force observer
         forceToObserver(%this.player.clientId);   

      case 6: //change team 1
         changePlayersTeam(%this.player.clientId, 1);
      
      case 7: //change team 2
         changePlayersTeam(%this.player.clientId, 2);
      
      case 8:   
         adminAddPlayerToGame(%this.player.clientId);

      case 9: // enable/disable voice communication
         togglePlayerVoiceCom( %this.player );

      case 10:
         confirmAdminListAdd( %this.player, false );

      case 11:
         confirmAdminListAdd( %this.player, true );
   }

   Canvas.popDialog( LobbyPlayerActionDlg );
}

function confirmAdminListAdd( %client, %super )
{
   if( %super )
      MessageBoxYesNo( "CONFIRM", "Are you sure you want to add " @ %client.name @ " to the server super admin list?", "toSuperList( " @ %client.clientId @ " );" );
         
   else
      MessageBoxYesNo( "CONFIRM", "Are you sure you want to add " @ %client.name @ " to the server admin list?", "toAdminList( " @ %client.clientId @ " );" );
}

function toSuperList( %client )
{
   commandToServer( 'AddToSuperAdminList', %client );
}

function toAdminList( %client )
{
   commandToServer( 'AddToAdminList', %client );
}

//------------------------------------------------------------------------------
function LobbyPlayerPopup::onCancel( %this )
{
   Canvas.popDialog( LobbyPlayerActionDlg );
}

//------------------------------------------------------------------------------
function togglePlayerMute(%client)
{
   commandToServer( 'togglePlayerMute', %client );
}

//------------------------------------------------------------------------------
function togglePlayerVoiceCom( %playerRep )
{
   commandToServer( 'ListenTo', %playerRep.clientId, !%playerRep.voiceEnabled, true );
}

//------------------------------------------------------------------------------
function forceToObserver( %client )
{
   commandToServer( 'forcePlayerToObserver', %client );
}

function AdminAddPlayerToGame(%client)
{
   CommandToServer( 'clientAddToGame', %client );
}

//------------------------------------------------------------------------------
function changePlayersTeam(%client, %team)
{
   commandToServer( 'changePlayersTeam', %client, %team);
}

//------------------------------------------------------------------------------
function fillLobbyVoteMenu()
{
   LobbyVoteMenu.key++;
   LobbyVoteMenu.clear();
   LobbyVoteMenu.tourneyChoose = 0;
   commandToServer( 'GetVoteMenu', LobbyVoteMenu.key );
}

//------------------------------------------------------------------------------
function fillLobbyTeamMenu()
{
   LobbyVoteMenu.key++;
   LobbyVoteMenu.clear();
   LobbyVoteMenu.mode = "team";
   commandToServer( 'GetTeamList', LobbyVoteMenu.key );
   LobbyCancelBtn.setVisible( true );
}

//------------------------------------------------------------------------------
function fillPlayerPopupMenu()
{
   LobbyPlayerPopup.key++;
   LobbyPlayerPopup.clear();
   
   LobbyPlayerPopup.add(LobbyPlayerPopup.player.name, 0);
   commandToServer( 'GetPlayerPopupMenu', LobbyPlayerPopup.player.clientId, LobbyPlayerPopup.key );
}

//------------------------------------------------------------------------------
function fillLobbyMissionTypeMenu()
{
   LobbyVoteMenu.key++;
   LobbyVoteMenu.clear();
   LobbyVoteMenu.mode = "type";
   commandToServer( 'GetMissionTypes', LobbyVoteMenu.key );
   LobbyCancelBtn.setVisible( true );
}

//------------------------------------------------------------------------------
function fillLobbyMissionMenu( %type, %typeName )
{
   LobbyVoteMenu.key++;
   LobbyVoteMenu.clear();
   LobbyVoteMenu.mode = "mission";
   LobbyVoteMenu.missionType = %type;
   LobbyVoteMenu.typeName = %typeName;
   commandToServer( 'GetMissionList', LobbyVoteMenu.key, %type );
}

//------------------------------------------------------------------------------
function fillLobbyTimeLimitMenu()
{
   LobbyVoteMenu.key++;
   LobbyVoteMenu.clear();
   LobbyVoteMenu.mode = "timeLimit";
   commandToServer( 'GetTimeLimitList', LobbyVoteMenu.key );
   LobbyCancelBtn.setVisible( true );
}

//------------------------------------------------------------------------------
addMessageCallback( 'MsgVoteItem', handleVoteItemMessage );
addMessageCallback( 'MsgPlayerPopupItem', handlePlayerPopupMessage );
addMessageCallback( 'MsgVotePassed', handleVotePassedMessage );
addMessageCallback( 'MsgVoteFailed', handleVoteFailedMessage );
addMessageCallback( 'MsgAdminPlayer', handleAdminPlayerMessage );
addMessageCallback( 'MsgAdminAdminPlayer', handleAdminAdminPlayerMessage );
addMessageCallback( 'MsgSuperAdminPlayer', handleSuperAdminPlayerMessage );
addMessageCallback( 'MsgAdminForce', handleAdminForceMessage );

//------------------------------------------------------------------------------
function handleAdminForceMessage()
{
   alxPlay(AdminForceSound, 0, 0, 0);
}

//------------------------------------------------------------------------------
function handleAdminAdminPlayerMessage( %msgType, %msgString, %client )
{
   %player = $PlayerList[%client];
   if(%player)
      %player.isAdmin = true;
   alxPlay(AdminForceSound, 0, 0, 0);
}

//------------------------------------------------------------------------------
function handleAdminPlayerMessage( %msgType, %msgString, %client )
{
   %player = $PlayerList[%client];
   if(%player)
      %player.isAdmin = true;
   alxPlay(VotePassSound, 0, 0, 0);
}

//------------------------------------------------------------------------------
function handleSuperAdminPlayerMessage( %msgType, %msgString, %client )
{
   %player = $PlayerList[%client];
   if(%player)
   {
      %player.isSuperAdmin = true;
      %player.isAdmin = true;
   }
   alxPlay(AdminForceSound, 0, 0, 0);
}

//------------------------------------------------------------------------------
function handleVoteItemMessage( %msgType, %msgString, %key, %voteName, %voteActionMsg, %voteText, %sort )
{
   if ( %key != LobbyVoteMenu.key )
      return;

   %index = LobbyVoteMenu.rowCount();
   LobbyVoteMenu.addRow( %index, detag( %voteText ) );
   if ( %sort )
      LobbyVoteMenu.sort( 0 );
   $clVoteCmd[%index] = detag( %voteName );
   $clVoteAction[%index] = detag( %voteActionMsg );
}

//------------------------------------------------------------------------------
function handlePlayerPopupMessage( %msgType, %msgString, %key, %voteName, %voteActionMsg, %voteText, %popupEntryId )
{
   if ( %key != LobbyPlayerPopup.key )
      return;

   LobbyPlayerPopup.add( "     " @ detag( %voteText ), %popupEntryId );
}

//------------------------------------------------------------------------------
function handleVotePassedMessage( %msgType, %msgString, %voteName, %voteText )
{
   if ( $InLobby )
      fillLobbyVoteMenu();
      
   alxPlay(VotePassSound, 0, 0, 0);
}

//------------------------------------------------------------------------------
function handleVoteFailedMessage( %msgType, %msgString, %voteName, %voteText )
{
   if ( $InLobby )
      fillLobbyVoteMenu();
      
   alxPlay(VoteNotPassSound, 0, 0, 0);
}

//------------------------------------------------------------------------------
function lobbyVote()
{
   %id = LobbyVoteMenu.getSelectedId();
   %text = LobbyVoteMenu.getRowTextById( %id );

   switch$ ( LobbyVoteMenu.mode )
   {
      case "": // Default case...
         // Test for special cases:
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
   }

   startNewVote( $clVoteCmd[%id], $clVoteAction[%id] );
   fillLobbyVoteMenu();
}

//------------------------------------------------------------------------------
function LobbyVoteMenu::reset( %this )
{
   %this.mode = "";
   %this.tourneyChoose = 0;
   LobbyCancelBtn.setVisible( false );
   fillLobbyVoteMenu();
}

//------------------------------------------------------------------------------
function lobbyPlayerVote(%voteType, %actionMsg, %playerId)
{
   startNewVote(%voteType, %playerId, 0, 0, 0, true);
   fillLobbyVoteMenu();
}
