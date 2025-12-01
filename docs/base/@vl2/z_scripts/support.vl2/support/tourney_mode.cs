// #name = TournyMode Query Support
// #version = 1.0.0
// #date = July 1, 2002
// #category = Support
// #author = Paul Tousignant
// #warrior = UberGuy (FT)
// #email = uberguy@tribalwar.com
// #web = http://scripts.tribalwar.com/uberguy
// #web = http://scripts.tribes-universe.com/uberguy
// #description = Callbacks and functions to test for touney mode.
// #status = Release
// #include = support/callback.cs

// This script sets a simple flag named $TourneyMode whenever you join a
// server or change maps to allow you to determine if you are in tourney
// mode or not. To use it, just test like so:

// if($TourneyMode) { ... }

//=============================================================================
//=============================================================================

addMessageCallback('MsgVoteItem', TM_onTourneyModeCallback);
Callback.add(onUserClientJoin,"TourneyMode::checkJustJoined");
Callback.add(onMissionDropInfo,"TourneyMode::checkJustJoined");

function TourneyMode::checkJustJoined() {

	commandToServer('GetVoteMenu', "TourneyQuery");
}

function TM_onTourneyModeCallback(%msgType, %msgString, %key, %voteName, %voteActionMsg, %voteText, %sort) {

	if (%key !$= "TourneyQuery") return;
	%voteName = detag(%voteName);
	if (%voteName $= "VoteFFAMode") $TourneyMode = true;
	else if (%voteName $= "VoteTournamentMode") $TourneyMode = false;
}
