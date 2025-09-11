package SkiFreeSinglePlayerShit {

// special loading for skifree maps
function TrainingGui::startTraining( %this ) {
	%file = getField( TrainingMissionList.getValue(), 1 );
	
	if( %file $= "SkiFree_Daily" 
		|| %file $= "SkiFree_Randomizer" 
		|| %file $= "SkiFreeZ_Championship_2021"
	) {
		MessagePopup( "STARTING MISSION", "Initializing, please wait..." );
		Canvas.repaint();
		cancelServerQuery();

		$ServerName = "SkiFree - Single Player";
			
		// setting $HostGameType to single player here keeps it off of the master server listing
		$HostGameType = "SinglePlayer";
		CreateServer( %file, "SkiFree" );
		
		%playerPref = $pref::Player[$pref::Player::Current];
		%playerName = getField( %playerPref, 0 );
		%playerRaceGender = getField( %playerPref, 1 );
		%playerSkin = getField( %playerPref, 2 );
		%playerVoice = getField( %playerPref, 3 );
		%playerVoicePitch = getField( %playerPref, 4 );
		localConnect( %playerName, %playerRaceGender, %playerSkin, %playerVoice, %playerVoicePitch );
	}
	else {
		Parent::startTraining( %this );
	}
}

// change the skifree challenge menu into the standard single player dialog
function escapeFromGame()
{
	if( $CurrentMission $= "SkiFree_Daily" 
		|| $CurrentMission $= "SkiFree_Randomizer" 
		|| $CurrentMission $= "SkiFreeZ_Championship_2021"
	) {
		Canvas.pushDialog( SinglePlayerEscapeDlg );
	}
	else {
		Parent::escapeFromGame();
	}
}

// why would you put the i18n object ON THE FUCKING CLIENT OBJECT
function SinglePlayerEscapeDlg::leaveGame( %this )
{
	if( $CurrentMission $= "SkiFree_Daily" ) {
		%line = "Thank you for playing";
		
		%client = ClientGroup.getObject(0);
		if( %client.bestTime != Game.trialDefaultTime ) {
			%line = %line @ ".\n\nDaily: " @ Game.terrain;
			%line = %line @ "\nTime: " @ %client.bestTime;
			%line = %line @ "\n\nVersion " @ $SkiFreeVersionString;
			
			if( %client.bestHandicap !$= "" ) {
				%line = %line @ "\n" @ %client.bestHandicap;
			}
		}
		else {
			%line = %line @ "\nin The Daily.";
		}
		
		Canvas.popDialog( SinglePlayerEscapeDlg );
		MessageBoxYesNo( "LEAVE GAME", %line, "forceFinish();", "$timeScale = 1;" );
	}
	else if( $CurrentMission $= "SkiFree_Randomizer" ) {
		Canvas.popDialog( SinglePlayerEscapeDlg );
		MessageBoxYesNo( "LEAVE GAME", "Are you sure? You'll never see this terrain again.", "forceFinish();", "$timeScale = 1;" );
	}
	else if( $CurrentMission $= "SkiFreeZ_Championship_2021" ) {
		%line = "Thank you for playing";
		
		%client = ClientGroup.getObject(0);
		if( %client.bestTime != Game.trialDefaultTime ) {
			%line = %line @ ".\n\n" @ Game.terrain;
			%line = %line @ "\nTime: " @ %client.bestTime;
			%line = %line @ "\n\nVersion " @ $SkiFreeVersionString;
			
			if( %client.bestHandicap !$= "" ) {
				%line = %line @ "\n" @ %client.bestHandicap;
			}
		}
		else {
			%line = %line @ "\nin the Championship.";
		}
		
		Canvas.popDialog( SinglePlayerEscapeDlg );
		MessageBoxYesNo( "LEAVE GAME", %line, "forceFinish();", "$timeScale = 1;" );
	}
	else {
		Parent::leaveGame(%this);
	}
}


};
activatePackage(SkiFreeSinglePlayerShit);