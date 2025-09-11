// Complete Event Hud
// Resizes when adding new/deleting old messages
// Message to tell clients to add a line to the HUD is:
//		'MsgTR2Event'
// v0.9
// As of 05-11-2002

// 07-09-2002
//
// Redid HUD so that all GUI objects are defined in PlayGui.gui.
// Resulting script code to manipulate HUD is pretty ugly from a logical standpoint
//  eg: that wouldn't work in C or C++ but you can do it in Tribes script..

// 05-13-2002
//
// Adjusted spacing/size of the hud. text is a little closer together now
// Lengthened the "popup" effect and the duration of individual events in the hud
//

// Usage:
// Server side:  messageAll('MsgTR2Event', "", <name of player(s)>, <sequence description>, <sequence value>);
// ALL color formatting is currently handled serverside.

// Any message from the server matching that message type invokes a client side callback
// The client message callback calls: TR2EventHud.addEvent(<player name(s)>, <sequence description>, <sequence value>);
// TR2 GUI Profiles

// KP:  Added these to match team name colors to skin colors

new GuiControlProfile ("GuiTextObjGoldLeftProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "204 204 0";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;
   fontColors[8] = $SmurfNameColor;
   fontColors[9] = $BotNameColor;
	justify = "left";
};

new GuiControlProfile ("GuiTextObjGoldCenterProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "204 204 0";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;
   fontColors[8] = $SmurfNameColor;
   fontColors[9] = $BotNameColor;
	justify = "center";
};

new GuiControlProfile ("GuiTextObjSilverLeftProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "170 170 170";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;
   fontColors[8] = $SmurfNameColor;
   fontColors[9] = $BotNameColor;
	justify = "left";
};

new GuiControlProfile ("GuiTextObjSilverCenterProfile")
{
	fontType = "Univers Condensed";
	fontSize = 16;
	fontColor = "170 170 170";
   fontColors[6] = $PlayerNameColor;
   fontColors[7] = $TribeTagColor;
   fontColors[8] = $SmurfNameColor;
   fontColors[9] = $BotNameColor;
	justify = "center";
};


new GuiControlProfile ("TR2TextProfile")
{
	fontType = "Univers";
	fontSize = 14;
	fontColor = "255 250 250";
};

new GuiControlProfile ("TR2BoldTextProfile")
{
	fontType = "Univers Bold";
	fontSize = 16;
	fontColor = "160 160 255";
};

new GuiControlProfile ("TR2LargeBoldTextProfile")
{
	fontType = "Univers Bold";
	fontSize = 30;
	fontColor = "255 255 255";
};

new GuiControlProfile ("TR2EventPopupProfile")
{
   bitmapbase = "gui/hud_new_window";
};

function handleNewEvent(%msgType, %msgString, %name, %message, %value)
{
	if( objectiveHud.gameType $= "TR2Game") // prevent server-initiated popups in non-TR2 games
		TR2EventHud.addEvent(%name, %message, %value);
	else
		return 0;
}

function TR2EventHud::resize(%this, %bigger)
{
	%offset = 0;
	if( %bigger > 0 )
	{
		if( %this.lines < 4 )
		{
			%this.lines++;
			%offset = %this.size[%this.lines - 1] - %this.size[%this.lines];
		}
		else
			%this.lines = 4;		
	}
	else if( %bigger < 0 )
	{	
		if( %this.lines > 0 )
		{
			%this.lines--;
			%offset = (%this.size[%this.lines + 1] - %this.size[%this.lines]);
		}
		else
			%this.lines = 0;
	}
	else
	{
		// no change...
		%offset = 0;
	}
	
	if( $TR2Pref::EventHud::DockToChat )
	{
		if( $TR2Pref::EventHud::ResizeUp )
		{
			%posx = getWord(OuterChatHud.position, 0);
			%posy = getWord(OuterChatHud.position, 1) + getWord(OuterChatHud.extent, 1) + 40 + %offset;
		}
		else
		{		
			%posx = getWord(OuterChatHud.position, 0);
			%posy = getWord(OuterChatHud.position, 1) + getWord(OuterChatHud.extent, 1) + 40;
		}
	}
	else
	{
		if( $TR2Pref::EventHud::ResizeUp )
		{
			%posx = getWord(TR2EventPopup.position, 0);
			%posy = getWord(TR2EventPopup.position, 1) + %offset;
		}
		else
		{			
			%posx = getWord(TR2EventPopup.position, 0);
			%posy = getWord(TR2EventPopup.position, 1);
		}
	}
	
	%extentx = getWord(TR2EventPopup.extent, 0);
	%extenty = %this.size[%this.lines];
	
	TR2EventPopup.resize(%posx, %posy, %extentx, %extenty);
}

function TR2EventHud::addEvent(%this, %player, %message, %value)
{	
	%this.pushBack();
	
	$TR2Event[1].player = %player;
	$TR2Event[1].message = %message;
	$TR2Event[1].value = %value;
	
	$TR2EventName.setText(%player);
	$TR2EventText[1].setText(%message);
	$TR2EventValue[1].setText(%value);
	
	%this.resize(1);
	TR2EventPopup.setVisible(1);
	// remove old events after %this.lineLife duration
	%this.schedule(%this.lineLife, "removeEvent");
	
}

function TR2EventHud::removeEvent(%this)
{
	// always remove last line...
	%line = %this.lines;
	
	if( %line > 4 || %line < 0 )
		return;
	
	%this.resize(-1);
	
	$TR2Event[%line].player = "";
	$TR2Event[%line].message = "";
	$TR2Event[%line].value = "";	
		
	$TR2EventText[%line].setText("");
	$TR2EventValue[%line].setText("");
	
	if( %line == 1 )
	{
		$TR2EventName.setText("");
	}

	if( %this.lines == 0 )
	{
		TR2EventPopup.setVisible(0);
	}
}	

function TR2EventHud::pushBack(%this) // move old messages down the HUD
{
	for( %i = 4; %i > 0; %i-- )
	{
		$TR2Event[%i].message = $TR2Event[(%i - 1)].message;
		$TR2Event[%i].player = $TR2Event[(%i - 1)].player;
		$TR2Event[%i].value = $TR2Event[(%i - 1)].value;
	}
	
	$TR2EventName.setText($TR2Event[1].player);
	
	for( %j = 1; %j <= 4; %j++ )
	{
		$TR2EventText[%j].setText($TR2Event[%j].message);
		$TR2EventValue[%j].setText($TR2Event[%j].value);
	}
}

package TR2Event
{	

function MainChatHud::nextChatHudLen(%this)
{
	if( $TR2Pref::EventHud::DockToChat )
		TR2EventPopup.setPosition(getWord(OuterChatHud.position, 0), getWord(OuterChatHud.position, 1) + getWord(OuterChatHud.extent, 1) + 40);
		
	parent::nextChatHudLen(%this);
}

};
activatePackage(TR2Event);

addMessageCallback('MsgTR2Event', handleNewEvent);

function createBonusPopup()
{
	if( isObject(TR2EventPopup) )
		TR2EventPopup.delete();
	new ShellFieldCtrl(TR2EventPopup) {
		profile = "TR2EventPopupProfile";
		horizSizing = "right";
		vertSizing = "top";
		position = "0 400";
		extent = "315 34";
		minExtent = "220 34";
		visible = "0";
		helpTag = "0";
	};	

	for( %i = 1; %i <= 4; %i++ )
	{
		%profile = %i == 1 ? "TR2BoldTextProfile" : "TR2TextProfile";
		%ypos = %i > 1 ? 16 * (%i-2) + 34 : 1;
		%yext = 16; //%i == 1 ? 16 : 16;
		$TR2EventText[%i] = new GuiMLTextCtrl() // GuiMLTextCtrl - ML = meta language..? kinda like html
		{
			profile = %profile;
			horizSizing = "left";
			vertSizing = "bottom";
			position = "4 " @ %ypos;
			extent = "276 " @ %yext;
			minExtent = "8 8";
			visible = "1";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "256";
		};
		TR2EventPopup.add($TR2EventText[%i]);
		
		$TR2EventValue[%i] = new GuiMLTextCtrl() // Sequence value field
		{
			profile = %profile;
			horizSizing = "right";
			vertSizing = "bottom";
			position = getWord($TR2EventText[%i].extent, 0) + 5 SPC %ypos;
			extent = "30 " @ %yext;
			minExtent = "8 8";
			visible = "1";
			helpTag = "0";
			lineSpacing = "2";
			allowColorChars = "0";
			maxChars = "5";
		};
		TR2EventPopup.add($TR2EventValue[%i]);		
	}
	$TR2EventName = new GuiMLTextCtrl() 
	{
		profile = "TR2BoldTextProfile"; // display the name...
		horizSizing = "left";
		vertSizing = "bottom";
		position = "25  17";
		extent = "286 16";
		minExtent = "8 8";
		visible = "1";
		helpTag = "0";
		lineSpacing = "2";
		allowColorChars = "0";
		maxChars = "256";
	};
	TR2EventPopup.add($TR2EventName);	
}

function createEventHudObjects()
{	
	if( isObject(TR2EventHud) )
		TR2EventHud.delete();	
	new ScriptObject("TR2EventHud")
	{
		class = "TR2EventHud";
		lines = 0;
		lifetime = 6000; // time after last popup that hud will disappear from screen
		lineLife = 6000; // time before a event in the hud is removed
		size[0] = 34;
		size[1] = 34;
		size[2] = 52;
		size[3] = 70;
		size[4] = 88;	
	};			
}

function createEventStorage()
{
	for(%j = 1; %j <= 4; %j++ ) // storing the sequence data in a script object
	{
		if( isObject($TR2Event[%j]) )
			$TR2Event[%j].delete();
		$TR2Event[%j] = new ScriptObject()
		{
			player = "";
			message = "";
			value = "";
		};
	}	
}

createBonusPopup();
PlayGui.add(TR2EventPopup);
createEventHudObjects();
createEventStorage();
TR2EventHud.resize(0);
	
