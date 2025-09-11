new GuiControlProfile ("TR2BonusBigText")
{
	fontType = "Verdana Bold";
	fontSize = $TR2Pref::BonusHud::BonusFontSize;
	fontColor = "255 255 51";
};

new GuiControlProfile ("TR2BonusHUGEText")
{
	fontType = "Verdana Bold";
	fontSize = 36;
	fontColor = "255 255 51";
};

new GuiControlProfile ("TR2BonusPopupProfile")
{
   bitmapbase = "gui/hud_new_window";
};

function createBonusHud()
{
	if( isObject(TR2BonusHud) )
		TR2BonusHud.delete();
		
	new ShellFieldCtrl(TR2BonusHud) {
		profile = "TR2BonusPopupProfile"; 
		horizSizing = "center";
		vertSizing = "bottom";
		position = "0 0";
		extent = "77 52";
		minExtent = "70 48";
		visible = "0";
		helpTag = "0";
	};
	
	%profile[1] = "TR2BonusBigText";
	%profile[2] = "TR2BonusHUGEText";
	%sizing[1] = "bottom";
	%sizing[2] = "top";
	%pos[1] = 3;
	%pos[2] = 17;
	%size[1] = "77 22";
	%size[2] = "77 50";
	for( %i = 1; %i <= 2; %i++ )
	{		
		$TR2BonusText[%i] = new GuiMLTextCtrl()
		{
			profile = %profile[%i];
			horizSizing = "center";
			vertSizing = %sizing[%i];
			position = "0 " @ %pos[%i];
			extent = %size[%i];
			minExtent = "8 8";
			visible = "1";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "256";
		};
		
		TR2BonusHud.add($TR2BonusText[%i]);
	}
	$TR2BonusText[1].setText("<just:center><color:4682B4>JACKPOT");
}

function TR2BonusHud::dockToChat(%this)
{
	%x = getWord(outerChatHud.extent, 2);
	%y = getWord(outerChatHud.position, 1);
	%this.setPosition(%x, %y);
}

function TR2BonusObject::flashText(%this, %count, %delay)
{
	for( %i = 0; %i < %count; %i++ )
	{
        %isNewBonus = %i % 2;
		%text = %isNewBonus ? $TR2Bonus::NewBonus : $TR2Bonus::OldBonus;
        %extraDelay = %isNewBonus ? 0 : 250;
		$TR2BonusText[2].schedule(%delay * %i + %extraDelay, "setText", %text);
	}
	$TR2BonusText[2].schedule(%delay * %count, "setText", $TR2Bonus::NewBonus);
}

function TR2BonusObject::doBonus(%this, %text, %color)
{
	if( %color $= "" )
		%color = "ffffff";
	TR2BonusHud.setVisible(1);
   $TR2Bonus::OldBonus = "<just:center><color:229922>" @ %this.currentBonus;
 
	$TR2Bonus::NewBonus = "<just:center><color:" @ %color @ ">" @ %text;

	// No flash if old score == new score
	if( %text !$= %this.currentBonus || (%text $= %this.currentBonus && %color !$= %this.currentColor) )
		%this.flashText(5, 500);
	
	%this.currentBonus = %text;
	%this.currentColor = %color;
}

function handleNewBonus(%msgType, %msgString, %text, %color)
{
	if( $TR2Bonus::Gametype $= "TR2Game")
		TR2BonusObject.doBonus(%text, %color);
}

function updateBonusTitle(%msgType, %msgString, %newTitle)
{
	$TR2BonusText[1].setText(%newTitle);
}

function captureGameType(%msgType, %msgString, %game)
{
	$TR2Bonus::Gametype = detag(%game);
	if( detag(%game) $= "TR2Game" )
		TR2BonusHud.setVisible(1);
	else
		TR2BonusHud.setVisible(0);
}

function setBonusHudState(%msgType, %msgString, %a, %b, %c)
{
	if( $TR2Bonus::Gametype $= "TR2Game" )
		TR2BonusHud.setVisible(1);
	else
		TR2BonusHud.setVisible(0);
}

createBonusHud();
PlayGui.add(TR2BonusHud);
$TR2BonusText[2].setText("<just:center><color:fffff0>0");
if( !isObject(TR2BonusObject) )
{
	new ScriptObject(TR2BonusObject)
	{
		class = TR2BonusObject;
		currentBonus = 0;
	};
}

//package TR2BonusHud
//{
//function PlayGui::onWake(%this)
//{
//	if( $TRBonus::Gametype $= "TR2Game" )
//		TR2BonusHud.setVisible(1);
//	else
//		TR2BonusHud.setVisible(0);
//			
//	parent::onWake(%this);
//}
//
//function PlayGui::onSleep(%this)
//{
//	TR2BonusHud.setVisible(0);
//	parent::onSleep(%this);
//}
//};
//activatePackage(TR2BonusHud);	

addMessageCallback('MsgTR2Bonus', handleNewBonus);
addMessageCallback('MsgTR2BonusTitle', updateBonusTitle);
addMessageCallback('MsgClientReady', captureGameType);
addMessageCallback('MsgMissionStart', setBonusHudState);
addMessageCallback('MsgMissionEnd', setBonusHudState);