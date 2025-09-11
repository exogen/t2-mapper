function aiConnectByIndex(%index, %team)
{
	if (%index < 0 || $BotProfile[%index, name] $= "")
		return;

	if (%team $= "")
		%team = -1;

	//initialize the profile, if required
	if ($BotProfile[%index, skill] $= "")
		$BotProfile[%index, skill] = 0.5;

	return aiConnect($BotProfile[%index, name], %team, $BotProfile[%index, skill], $BotProfile[%index, offense], $BotProfile[%index, voice], $BotProfile[%index, voicePitch]);
}

function aiConnectByName(%name, %team)
{
	if (%name $= "")
		return;

	if (%team $= "")
		%team = -1;

	%foundIndex = -1;
	%index = 0;
	while ($BotProfile[%index, name] !$= "")
	{
		if ($BotProfile[%index, name] $= %name)
		{
			%foundIndex = %index;
			break;
		}
		else
			%index++;
	}

	//see if we found our bot
	if (%foundIndex >= 0)
		return aiConnectByIndex(%foundIndex, %team);

	//else add a new bot profile
	else
	{
		$BotProfile[%index, name] = %name;
		return aiConnectByIndex(%index, %team);
	}
}

function aiBotAlreadyConnected(%name)
{
	%count = ClientGroup.getCount();
	for (%i = 0; %i < %count; %i++)
	{
		%client = ClientGroup.getObject(%i);
		if (%name $= getTaggedString(%client.name))
			return true;
	}

	return false;
}

function aiConnectMultiple(%numToConnect, %minSkill, %maxSkill, %team)
{
	//validate the args
	if (%numToConnect <= 0)
		return;

	if (%maxSkill < 0)
		%maxSkill = 0;

	if (%minSkill >= %maxSkill)
		%minSkill = %maxSkill - 0.01;

	if (%team $= "")
		%team = -1;

	//loop through the profiles, and set the flags and initialize
	%numBotsAlreadyConnected = 0;
	%index = 0;
	while ($BotProfile[%index, name] !$= "")
	{
		//initialize the profile if required
		if ($BotProfile[%index, skill] $= "")
			$BotProfile[%index, skill] = 0.5;

		//if the bot is already playing, it shouldn't be reselected
		if (aiBotAlreadyConnected($BotProfile[%index, name]))
		{
			$BotProfile[%index, canSelect] = false;
			%numBotsAlreadyConnected++;
		}
		else
			$BotProfile[%index, canSelect] = true;

		%index++;
	}

	//make sure we're not trying to add more bots than we have...
	if (%numToConnect > (%index - %numBotsAlreadyConnected))
		%numToConnect = (%index - %numBotsAlreadyConnected);

	//build the array of possible candidates...
	%index = 0;
	%tableCount = 0;
	while ($BotProfile[%index, name] !$= "")
	{
		%botSkill = $BotProfile[%index, skill];

		//see if the skill is within range
		if ($BotProfile[%index, canSelect] && %botSkill >= %minSkill && %botSkill <= %maxSkill)
		{
			$BotSelectTable[%tableCount] = %index;
			%tableCount++;
			$BotProfile[%index, canSelect] = false;
		}
		
		//check the next bot
		%index++;
	}

	//if we didn't find enough bots, we'll have to search the rest of the profiles...
	%searchMinSkill = %minSkill;
	while ((%tableCount < %numToConnect) && (%searchMinSkill > 0))
	{
		%index = 0;
		while ($BotProfile[%index, name] !$= "")
		{
			%botSkill = $BotProfile[%index, skill];

			//see if the skill is within range
			if ($BotProfile[%index, canSelect] && %botSkill >= (%searchMinSkill - 0.1) && %botSkill <= %searchMinSkill)
			{
				$BotSelectTable[%tableCount] = %index;
				%tableCount++;
				$BotProfile[%index, canSelect] = false;
			}
			
			//check the next bot
			%index++;
		}

		//now lower the search min Skill, and take another pass at a lower skill level
		%searchMinSkill = %searchMinSkill - 0.1;
	}

	//if we're still short of bots, search the higher skill levels
	%searchMaxSkill = %maxSkill;
	while ((%tableCount < %numToConnect) && (%searchMaxSkill < 1.0))
	{
		%index = 0;
		while ($BotProfile[%index, name] !$= "")
		{
			%botSkill = $BotProfile[%index, skill];
			//see if the skill is within range
			if ($BotProfile[%index, canSelect] && %botSkill >= %searchMaxSkill && %botSkill <= (%searchMaxSkill + 0.1))
			{
				$BotSelectTable[%tableCount] = %index;
				%tableCount++;
				$BotProfile[%index, canSelect] = false;
			}
			
			//check the next bot
			%index++;
		}

		//now raise the search max Skill, and take another pass at a higher skill level
		%searchMaxSkill = %searchMaxSkill + 0.1;
	}

	//since the numToConnect was capped at the table size, we should have enough bots in the
	//table to fulfill the quota

	//loop through five times, picking random indices, and adding them until we've added enough
	%numBotsConnected = 0;
	for (%i = 0; %i < 5; %i++)
	{
		for (%j = 0; %j < %numToConnect; %j++)
		{
			%selectedIndex = mFloor(getRandom() * (%tableCount - 0.1));
			if ($BotSelectTable[%selectedIndex] >= 0)
			{
				//connect the bot
				%botClient = aiConnectByIndex($BotSelectTable[%selectedIndex], %team);
				%numBotsConnected++;

				//adjust the skill level, if required
				%botSkill = %botClient.getSkillLevel();
				if (%botSkill < %minSkill || %botSkill > %maxSkill)
				{
					%newSkill = %minSKill + (getRandom() * (%maxSkill - %minSkill));
					%botClient.setSkillLevel(%newSkill);
				}

				//clear the table entry to avoid connecting duplicates
				$BotSelectTable[%selectedIndex] = -1;

				//see if we've connected enough
				if (%numBotsConnected == %numToConnect)
					return;
			}
		}
	}

	//at this point, we've looped though the table, and kept hitting duplicates, search the table sequentially
	for (%i = 0; %i < %tableCount; %i++)
	{
		if ($BotSelectTable[%i] >= 0)
		{
			//connect the bot
			%botClient = aiConnectByIndex($BotSelectTable[%i], %team);
			%numBotsConnected++;

			//adjust the skill level, if required
			%botSkill = %botClient.getSkillLevel();
			if (%botSkill < %minSkill || %botSkill > %maxSkill)
			{
				%newSkill = %minSKill + (getRandom() * (%maxSkill - %minSkill));
				%botClient.setSkillLevel(%newSkill);
			}

			//clear the table entry to avoid connecting duplicates
			$BotSelectTable[%i] = -1;

			//see if we've connected enough
			if (%numBotsConnected == %numToConnect)
				return;
		}
	}
}

$BotProfile[0, name] = "Kidney BOT"; 
$BotProfile[0, skill] = 0.99;
$BotProfile[0, offense] = true;
$BotProfile[0, voicePitch] = 0.875;
$BotProfile[1, name] = "BOT Milk?"; 
$BotProfile[1, skill] = 0.99;
$BotProfile[1, offense] = true;
$BotProfile[1, voicePitch] = 0.89;
$BotProfile[2, name] = "UberBOT"; 
$BotProfile[2, skill] = 0.99;
$BotProfile[2, offense] = true;
$BotProfile[2, voicePitch] = 0.95;
$BotProfile[3, name] = "SymBOT"; 
$BotProfile[3, skill] = 0.99;
$BotProfile[3, offense] = true;
$BotProfile[3, voicePitch] = 1.1;
$BotProfile[4, name] = "QIX BOT"; 
$BotProfile[4, skill] = 0.99;
$BotProfile[4, offense] = false;
$BotProfile[4, voicePitch] = 1.12;
$BotProfile[5, name] = "Rated BOT"; 
$BotProfile[5, skill] = 0.99;
$BotProfile[5, offense] = true;
$BotProfile[5, voicePitch] = 0.92;
$BotProfile[6, name] = "Dr.BOTward";
$BotProfile[6, skill] = 0.99;
$BotProfile[6, offense] = true;
$BotProfile[6, voicePitch] = 0.96;
$BotProfile[7, name] = "Frank BOTzo";
$BotProfile[7, skill] = 0.99;
$BotProfile[7, offense] = true;
$BotProfile[7, voicePitch] = 0.88;
$BotProfile[8, name] = "Missing BOT";
$BotProfile[8, skill] = 0.99;
$BotProfile[8, offense] = true;
$BotProfile[8, voicePitch] = 1.125;
$BotProfile[9, name] = "Jett BOT";
$BotProfile[9, skill] = 0.99;
$BotProfile[9, offense] = false;
$BotProfile[9, voicePitch] = 1.12;
$BotProfile[10, name] = "HexaBOTic";
$BotProfile[10, skill] = 0.99;
$BotProfile[10, offense] = true;
$BotProfile[10, voicePitch] = 0.895;
$BotProfile[11, name] = "Sne/\\kBOT";
$BotProfile[11, skill] = 0.99;
$BotProfile[11, offense] = true;
$BotProfile[11, voicePitch] = 0.885;
$BotProfile[12, name] = "DiamondBOT";
$BotProfile[12, skill] = 0.99;
$BotProfile[12, offense] = true;
$BotProfile[12, voicePitch] = 1.05;
$BotProfile[13, name] = "Jimmy BOT"; 
$BotProfile[13, skill] = 0.99;
$BotProfile[13, offense] = true;
$BotProfile[13, voicePitch] = 1.09;
$BotProfile[14, name] = "Skeet BOT";
$BotProfile[14, skill] = 0.99;
$BotProfile[14, offense] = false;
$BotProfile[14, voicePitch] = 1.0;
$BotProfile[15, name] = "BigBOTDawg";
$BotProfile[15, skill] = 0.99;
$BotProfile[15, offense] = true;
$BotProfile[15, voicePitch] = 0.9;
$BotProfile[16, name] = "BOTIN8R";
$BotProfile[16, skill] = 0.99;
$BotProfile[16, offense] = true;
$BotProfile[16, voicePitch] = 0.97;
$BotProfile[17, name] = "OrphanKazBOT";
$BotProfile[17, skill] = 0.99;
$BotProfile[17, offense] = true;
$BotProfile[17, voicePitch] = 0.925;
$BotProfile[18, name] = "Terrible BOT";
$BotProfile[18, skill] = 0.99;
$BotProfile[18, offense] = true;
$BotProfile[18, voicePitch] = 1.115;
$BotProfile[19, name] = "Mongo BOT";
$BotProfile[19, skill] = 0.99;
$BotProfile[19, offense] = false;
$BotProfile[19, voicePitch] = 1.12;
$BotProfile[20, name] = "East BOT";
$BotProfile[20, skill] = 0.99;
$BotProfile[20, offense] = true;
$BotProfile[20, voicePitch] = 1.125;
$BotProfile[21, name] = "Snow LeoBOT";
$BotProfile[21, skill] = 0.99;
$BotProfile[21, offense] = true;
$BotProfile[21, voicePitch] = 1.05;
$BotProfile[22, name] = "Twitch BOT";
$BotProfile[22, skill] = 0.99;
$BotProfile[22, offense] = true;
$BotProfile[22, voicePitch] = 0.893;
$BotProfile[23, name] = "ShazBOT";
$BotProfile[23, skill] = 0.99;
$BotProfile[23, offense] = true;
$BotProfile[23, voicePitch] = 0.879;

$BotProfile[24, name] = "Fishbait";
$BotProfile[24, skill] = 0.00;
$BotProfile[24, offense] = true;
$BotProfile[24, voicePitch] = 1.125;
$BotProfile[25, name] = "Skulker";
$BotProfile[25, skill] = 0.00;
$BotProfile[25, offense] = false;
$BotProfile[25, voicePitch] = 1.1;
$BotProfile[26, name] = "Dogstar";
$BotProfile[26, skill] = 0.00;
$BotProfile[26, offense] = false;
$BotProfile[26, voicePitch] = 1.02;
$BotProfile[27, name] = "Bonehead";
$BotProfile[27, skill] = 0.00;
$BotProfile[27, offense] = false;
$BotProfile[27, voicePitch] = 0.975;
$BotProfile[28, name] = "Torus";
$BotProfile[28, skill] = 0.00;
$BotProfile[28, offense] = false;
$BotProfile[28, voicePitch] = 0.9;
$BotProfile[29, name] = "Glitter";
$BotProfile[29, skill] = 0.05;
$BotProfile[29, offense] = true;
$BotProfile[29, voicePitch] = 1.1;
$BotProfile[30, name] = "Wirehead";
$BotProfile[30, skill] = 0.05;
$BotProfile[30, offense] = false;
$BotProfile[30, voicePitch] = 1.03;
$BotProfile[31, name] = "Ironbreath";
$BotProfile[31, skill] = 0.10;
$BotProfile[31, offense] = false;
$BotProfile[31, voicePitch] = 1.02;
$BotProfile[32, name] = "Hagstomper";
$BotProfile[32, skill] = 0.10;
$BotProfile[32, offense] = false;
$BotProfile[32, voicePitch] = 0.899;
$BotProfile[33, name] = "Doormat";
$BotProfile[33, skill] = 0.15;
$BotProfile[33, offense] = false;
$BotProfile[33, voicePitch] = 0.97;
$BotProfile[34, name] = "TickTock";
$BotProfile[34, skill] = 0.15;
$BotProfile[34, offense] = true;
$BotProfile[34, voicePitch] = 1.07;
$BotProfile[35, name] = "ElectroJag";
$BotProfile[35, skill] = 0.20;
$BotProfile[35, offense] = false;
$BotProfile[35, voicePitch] = 0.915;
$BotProfile[36, name] = "Jetsam";
$BotProfile[36, skill] = 0.20;
$BotProfile[36, offense] = false;
$BotProfile[36, voicePitch] = 1.09;
$BotProfile[37, name] = "Newguns";
$BotProfile[37, skill] = 0.25;
$BotProfile[37, offense] = false;
$BotProfile[37, voicePitch] = 0.885;
$BotProfile[38, name] = "WrongWay";
$BotProfile[38, skill] = 0.25;
$BotProfile[38, offense] = false;
$BotProfile[38, voicePitch] = 0.875;
$BotProfile[39, name] = "Ragbinder";
$BotProfile[39, skill] = 0.30;
$BotProfile[39, offense] = true;
$BotProfile[39, voicePitch] = 1.1;
$BotProfile[40, name] = "Retch";
$BotProfile[40, skill] = 0.30;
$BotProfile[40, offense] = false;
$BotProfile[40, voicePitch] = 1.12;
$BotProfile[41, name] = "Hotfoot";
$BotProfile[41, skill] = 0.35;
$BotProfile[41, offense] = false;
$BotProfile[41, voicePitch] = 0.93;
$BotProfile[42, name] = "Trail of Rust";
$BotProfile[42, skill] = 0.35;
$BotProfile[42, offense] = false;
$BotProfile[42, voicePitch] = 0.88;
$BotProfile[43, name] = "Zigzag";
$BotProfile[43, skill] = 0.40;
$BotProfile[43, offense] = false;
$BotProfile[43, voicePitch] = 0.89;
$BotProfile[44, name] = "Gray Sabot";
$BotProfile[44, skill] = 0.40;
$BotProfile[44, offense] = true;
$BotProfile[44, voicePitch] = 0.879;
$BotProfile[45, name] = "Hellefleur";
$BotProfile[45, skill] = 0.45;
$BotProfile[45, offense] = false;
$BotProfile[45, voicePitch] = 1.11;
$BotProfile[46, name] = "Slicer";
$BotProfile[46, skill] = 0.45;
$BotProfile[46, offense] = false;
$BotProfile[46, voicePitch] = 1.12;
$BotProfile[47, name] = "Rampant";
$BotProfile[47, skill] = 0.45;
$BotProfile[47, offense] = false;
$BotProfile[47, voicePitch] = 0.935;
$BotProfile[48, name] = "Troglodyte";
$BotProfile[48, skill] = 0.45;
$BotProfile[48, offense] = true;
$BotProfile[48, voicePitch] = 1.121;
$BotProfile[49, name] = "Evenkill";
$BotProfile[49, skill] = 0.50;
$BotProfile[49, offense] = false;
$BotProfile[49, voicePitch] = 1.05;
$BotProfile[50, name] = "Simrionic";
$BotProfile[50, skill] = 0.50;
$BotProfile[50, offense] = false;
$BotProfile[50, voicePitch] = 0.895;
$BotProfile[51, name] = "Cathode Kiss";
$BotProfile[51, skill] = 0.50;
$BotProfile[51, offense] = false;
$BotProfile[51, voicePitch] = 0.97;
$BotProfile[52, name] = "So Dark";
$BotProfile[52, skill] = 0.55;
$BotProfile[52, offense] = true;
$BotProfile[52, voicePitch] = 1.01;
$BotProfile[53, name] = "Deathwind";
$BotProfile[53, skill] = 0.55;
$BotProfile[53, offense] = false;
$BotProfile[53, voicePitch] = 1.12;
$BotProfile[54, name] = "Dharmic Sword";
$BotProfile[54, skill] = 0.55;
$BotProfile[54, offense] = false;
$BotProfile[54, voicePitch] = 1.0;
$BotProfile[55, name] = "Demonshriek";
$BotProfile[55, skill] = 0.60;
$BotProfile[55, offense] = false;
$BotProfile[55, voicePitch] = 1.05;
$BotProfile[56, name] = "Terrapin";
$BotProfile[56, skill] = 0.60;
$BotProfile[56, offense] = true;
$BotProfile[56, voicePitch] = 1.085;
$BotProfile[57, name] = "No-Dachi";
$BotProfile[57, skill] = 0.60;
$BotProfile[57, offense] = true;
$BotProfile[57, voicePitch] = 0.905;
$BotProfile[58, name] = "Irrelevant Smoke";
$BotProfile[58, skill] = 0.65;
$BotProfile[58, offense] = false;
$BotProfile[58, voicePitch] = 0.935;
$BotProfile[59, name] = "Red Ghost";
$BotProfile[59, skill] = 0.65;
$BotProfile[59, offense] = false;
$BotProfile[59, voicePitch] = 1.21;
$BotProfile[60, name] = "Perilous";
$BotProfile[60, skill] = 0.65;
$BotProfile[60, offense] = true;
$BotProfile[60, voicePitch] = 0.895;
$BotProfile[61, name] = "The Golden";
$BotProfile[61, skill] = 0.70;
$BotProfile[61, offense] = true;
$BotProfile[61, voicePitch] = 0.88;
$BotProfile[62, name] = "Vanguard";
$BotProfile[62, skill] = 0.70;
$BotProfile[62, offense] = false;
$BotProfile[62, voicePitch] = 1.1;
$BotProfile[63, name] = "Heretik";
$BotProfile[63, skill] = 0.70;
$BotProfile[63, offense] = true;
$BotProfile[63, voicePitch] = 0.945;
$BotProfile[64, name] = "Akhiles";
$BotProfile[64, skill] = 0.75;
$BotProfile[64, offense] = true;
$BotProfile[64, voicePitch] = 0.915;
$BotProfile[65, name] = "Nova-9";
$BotProfile[65, skill] = 0.75;
$BotProfile[65, offense] = false;
$BotProfile[65, voicePitch] = 1.12;
$BotProfile[66, name] = "Hotspur";
$BotProfile[66, skill] = 0.75;
$BotProfile[66, offense] = true;
$BotProfile[66, voicePitch] = 1.11;
$BotProfile[67, name] = "DustWitch";
$BotProfile[67, skill] = 0.80;
$BotProfile[67, offense] = true;
$BotProfile[67, voicePitch] = 0.875;
$BotProfile[68, name] = "Mojo Savage";
$BotProfile[68, skill] = 0.80;
$BotProfile[68, offense] = true;
$BotProfile[68, voicePitch] = 1.05;
$BotProfile[69, name] = "Velomancer";
$BotProfile[69, skill] = 0.80;
$BotProfile[69, offense] = false;
$BotProfile[69, voicePitch] = 1.085;
$BotProfile[70, name] = "Mohican";
$BotProfile[70, skill] = 0.85;
$BotProfile[70, offense] = true;
$BotProfile[70, voicePitch] = 1.045;
$BotProfile[71, name] = "Widowmaker";
$BotProfile[71, skill] = 0.85;
$BotProfile[71, offense] = true;
$BotProfile[71, voicePitch] = 1.04;
$BotProfile[72, name] = "Punch";
$BotProfile[72, skill] = 0.85;
$BotProfile[72, offense] = true;
$BotProfile[72, voicePitch] = 0.89;
$BotProfile[73, name] = "Mameluke";
$BotProfile[73, skill] = 0.90;
$BotProfile[73, offense] = false;
$BotProfile[73, voicePitch] = 0.882;
$BotProfile[74, name] = "King Snake";
$BotProfile[74, skill] = 0.90;
$BotProfile[74, offense] = true;
$BotProfile[74, voicePitch] = 1.05;
$BotProfile[75, name] = "Sorrow";
$BotProfile[75, skill] = 0.90;
$BotProfile[75, offense] = true;
$BotProfile[75, voicePitch] = 1.09;
$BotProfile[76, name] = "Devourer";
$BotProfile[76, skill] = 0.95;
$BotProfile[76, offense] = true;
$BotProfile[76, voicePitch] = 0.929;
$BotProfile[77, name] = "Fated to Glory";
$BotProfile[77, skill] = 0.95;
$BotProfile[77, offense] = true;
$BotProfile[77, voicePitch] = 0.915;
$BotProfile[78, name] = "Neon Blossom";
$BotProfile[78, skill] = 0.95;
$BotProfile[78, offense] = false;
$BotProfile[78, voicePitch] = 1.125;
$BotProfile[79, name] = "Shiver";
$BotProfile[79, skill] = 0.95;
$BotProfile[79, offense] = true;
$BotProfile[79, voicePitch] = 0.875;
