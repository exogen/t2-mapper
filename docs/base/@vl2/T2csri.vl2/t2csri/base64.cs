// Torque Script Base64 Utilities
// Written by Electricutioner
// 10:43 PM 7/13/2005

// Used under license by the Tribes 2 Community System Re-engineering Intitiative.
// License Granted: 10/31/2008

// necessary for the transfer of arbitrary binary data over ASCII connections
function Base64_Encode(%string)
{
	%encoded = "";
	for (%i = 0; %i < strLen(%string); %i += 3)
	{
		%binBlock = "";
		for (%j = 0; %j < 3; %j++)
		{
			%bin = DecToBin(strCmp(getSubStr(%string, %i + %j, 1), ""));
			while (strLen(%bin) < 8 && strLen(%bin) != 0)
				%bin = "0" @ %bin;
			%binBlock = %binBlock @ %bin;
		}
		for (%j = 0; %j < 4; %j++)
		{
			%bin = getSubStr(%binBlock, 6 * %j, 6);
			if (%bin !$= "")
			{
				while(strLen(%bin) < 6)
					%bin = %bin @ "0";
				%encoded = %encoded @ $Base64Utils::Base64Chars[BinToDec(%bin)];
			}
			else
				%encoded = %encoded @ "=";
		}
	}
	return %encoded;
}
function Base64_Decode(%string)
{
	%decoded = "";
	for (%i = 0; %i < strLen(%string); %i += 4)
	{
		%binBlock = "";
		for (%j = 0; %j < 4; %j++)
		{
			%bin = "";
			%val = Base64_ValToIndex(strCmp(getSubStr(%string, %i + %j, 1), ""));
			if (%val != -1)
				%bin = DecToBin(%val);
			while (strLen(%bin) < 6 && %val != -1)
				%bin = "0" @ %bin;
			%binBlock = %binBlock @ %bin;
		}
		for (%j = 0; %j < 3; %j++)
		{
			%bin = getSubStr(%binBlock, 8 * %j, 8);
			while(strLen(%bin) < 8 && strLen(%bin) != 0)
				%bin = "0" @ %bin; 
			if (%bin !$= "")
				%decoded = %decoded @ collapseEscape("\\x" @ DecToHex(BinToDec(%bin)));
		}
	}

	return %decoded;
}
// a few conditionals are better than a loop
function Base64_ValToIndex(%val)
{
	if (%val > 96 && %val < 123)
		return %val - 71;
	else if (%val > 64 && %val < 91)
		return %val - 65;
	else if (%val > 47 && %val < 58)
		return %val + 4;
	else if (%val == 43)
		return 62;
	else if (%val == 47)
		return 63;
	else if (%val == 61)
		return -1;
	else
		return "";
}

//create the character array in a minimum of fuss
function Base64_CreateArray()
{
	for (%i = 0; %i < 26; %i++)
	{
		$Base64Utils::Base64Chars[%i] = collapseEscape("\\x" @ DecToHex(65 + %i));
		$Base64Utils::Base64Chars[%i + 26] = collapseEscape("\\x" @ DecToHex(97 + %i));

		if (%i < 10)
			$Base64Utils::Base64Chars[%i + 52] = %i;
	}
	$Base64Utils::Base64Chars[62] = "+";
	$Base64Utils::Base64Chars[63] = "/";
}

// these binary conversion functions are much better than older ones
// these can handle just about any size of input, unlike 8 bit like the previous ones
function DecToBin(%dec)
{
	%length = mCeil(mLog(%dec) / mLog(2));
	%bin = "";
	for (%i = 0; %i <= %length; %i++)
	{
		%test = mPow(2, %length - %i);
		if (%dec >= %test)
		{
			%bin = %bin @ "1";
			%dec -= %test;
		}
		else if (%i > 0)
			%bin = %bin @ "0";
	}
	return %bin;
}
function BinToDec(%bin)
{
	%dec = 0;
	for (%i = 0; %i < strLen(%bin); %i++)
		%dec += getSubStr(%bin, %i, 1) * mPow(2, strLen(%bin) - %i - 1);
	return %dec;
}

//no length limit
function DecToHex(%dec)
{
	%bin = DecToBin(%dec);
	while (strLen(%bin) % 4 != 0)
		%bin = "0" @ %bin;

	for (%i = 0; %i < strLen(%bin); %i += 4)
	{
		%block = getSubStr(%bin, strLen(%bin) - %i - 4, 4);
		%part = BinToDec(%block);
		if (%part > 9)
		{
			switch (%part)
			{
				case 10:
					%hex = "a" @ %hex;
				case 11:
					%hex = "b" @ %hex;
				case 12:
					%hex = "c" @ %hex;
				case 13:
					%hex = "d" @ %hex;
				case 14:
					%hex = "e" @ %hex;
				case 15:
					%hex = "f" @ %hex;
			}
		}
		else
			%hex = %part @ %hex;
	}
	if (strlen(%hex) == 0)
		return "00";
	else
		return %hex;
}

Base64_CreateArray();