package RS_SHBFT {

function DisconnectedCleanup() {
	deactivatePackage(RS_SHBFT);
	Parent::DisconnectedCleanup();
}

function CTFGame::gameOver(%game) {
	Parent::gameOver(%game);
	deactivatePackage(RS_SHBFT);
}

function CTFGame::missionLoadDone(%game) {
	Parent::missionLoadDone(%game);

	// set up the scoreboard
	RSSB_updateScore(1,0);
	RSSB_updateScore(2,0);
}

function CTFGame::checkScoreLimit(%game, %team) {
	// this function is called every time the score changes
	// by all means, it can be used to display the score
	RSSB_updateScore(%team, $TeamScore[%team]);
	Parent::checkScoreLimit(%game, %team);
}

// scoreboard functions... in case you really wanted to know
// RSSB_ is used as a prefix for these functions
function RSSB_updateScore(%team, %score) {
	if( %team == 1 )
		%str = "storm";
	else if( %team == 2 )
		%str = "inferno";
	else
		return;

	if( %score > 9999) {
		%ten = 9;
		%one = 9;
	}
	else {
		%ten = mFloor(%score / 1000) % 10;
		%one = mFloor(%score / 100) % 10;
	}

	%group10 = nameToID("SB_" @ %str @ "10");
	%group1 = nameToID("SB_" @ %str @ "1");

	if( %ten == 0 )
		RSSB_setDisplayNumber(%group10, -1);
	else
		RSSB_setDisplayNumber(%group10, %ten);

	RSSB_setDisplayNumber(%group1, %one);
}

function RSSB_setDisplayNumber(%simgroup, %value) {
	if( %value == -1 ) {
		for( %i = 0; %i < 7; %i++ )
			RSSB_changeLight(%simgroup, %i, 0);

		return;
	}

	// TOP
	if( %value == 1 || %value == 4 )
		RSSB_changeLight(%simgroup, 0, 0);
	else
		RSSB_changeLight(%simgroup, 0, 1);

	// TOP LEFT
	if( %value == 7 || (%value >= 1 && %value <= 3) )
		RSSB_changeLight(%simgroup, 1, 0);
	else
		RSSB_changeLight(%simgroup, 1, 1);

	// TOP RIGHT
	if( %value == 5 || %value == 6 )
		RSSB_changeLight(%simgroup, 2, 0);
	else
		RSSB_changeLight(%simgroup, 2, 1);

	// MIDDLE
	if( %value <= 1 || %value == 7 )
		RSSB_changeLight(%simgroup, 3, 0);
	else
		RSSB_changeLight(%simgroup, 3, 1);

	// BOTTOM LEFT
	if( %value % 2 == 1 || %value == 4 )
		RSSB_changeLight(%simgroup, 4, 0);
	else
		RSSB_changeLight(%simgroup, 4, 1);

	// BOTTOM RIGHT
	if( %value == 2 )
		RSSB_changeLight(%simgroup, 5, 0);
	else
		RSSB_changeLight(%simgroup, 5, 1);

	// BOTTOM
	if( %value == 1 || %value == 4 || %value == 7 )
		RSSB_changeLight(%simgroup, 6, 0);
	else
		RSSB_changeLight(%simgroup, 6, 1);
}

function RSSB_changeLight(%simgroup, %lightType, %light) {
	for( %i = 0; %i < %simgroup.getCount(); %i++ ) {
		%field = %simgroup.getObject(%i);

		if( %field.scoreLightType == %lightType ) {
			if( %light )
				%field.close();
			else
				%field.open();

			return;
		}
	}
}
// end scoreboard functions

};
