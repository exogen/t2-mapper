//------------------------------------------------------------------------------
function ScoreScreen::setupHud(%obj, %tag)
{
}

//------------------------------------------------------------------------------
function ScoreScreen::loadHud(%obj, %tag)
{
   $Hud[%tag] = ScoreScreen;
   $Hud[%tag].childGui = ScoreContent;
   $Hud[%tag].parent = ScoreParent;
}

//------------------------------------------------------------------------------
function ScoreScreen::onWake(%this)
{
   if ( isObject( hudMap ) )
   {
      hudMap.pop();
      hudMap.delete();
   }
   new ActionMap( hudMap );
   hudMap.blockBind( moveMap, toggleInventoryHud );
   hudMap.blockBind( moveMap, toggleCommanderMap );
   hudMap.bindCmd( keyboard, escape, "", "toggleCursorHuds('scoreScreen');" );
   hudMap.push();
}

//------------------------------------------------------------------------------
function ScoreScreen::onSleep(%this)
{
   hudMap.pop();
   hudMap.delete();

   //make sure the action maps are still pushed in the correct order...
   updateActionMaps();
}

//------------------------------------------------------------------------------
function ScoreScreen::addLine(%obj, %tag, %lineNum, %name)
{
   %yOffset = (%lineNum * 20) + 5;
   $Hud[%tag].count++;
   $Hud[%tag].childGui.resize( 3, 3, 586, %yOffset + 25 );
   $Hud[%tag].data[%lineNum,0] = new GuiMLTextCtrl() 
   {
		profile = "ScoreTextProfile";
		horizSizing = "right";
		vertSizing = "bottom";
		position = "0 " @ %yOffset;
		extent = "566 22";
		minExtent = "8 8";
		visible = "1";
		setFirstResponder = "0";
		modal = "1";
		helpTag = "0";
		text = "";
//		command = "ScoreScreenOnMouseDown(" @ %lineNum @ ");";
   };
   return 1;
}

//------------------------------------------------------------------------------
addMessageCallback( 'SetScoreHudHeader', setScoreHudHeader );
addMessageCallback( 'SetScoreHudSubheader', setScoreHudSubheader );

function setScoreHudHeader( %msgType, %msgString, %a0 )
{
   %text = detag( %a0 );
   ScoreHeaderText.setValue( %text );   
   if ( %text $= "" )
   {
      ScoreHeaderField.setVisible( false );
      ScoreField.resize( 23, 32, 594, 426 );
   }
   else
   {
      ScoreHeaderField.setVisible( true );
      ScoreField.resize( 23, 72, 594, 386 );
   }
}

function setScoreHudSubheader( %msgType, %msgString, %a0 )
{
   ScoreSubheaderText.setValue( detag( %a0 ) );   
}

/////////////////////////////////////////////////////////////////////////////////
// Hunters Tracking requires this - if we put it back in, uncomment this section
// function ScoreScreenOnMouseDown(%line)
// {
// 	if ($CurrentMissionType $= "Hunters")
// 		commandToServer('huntersTrackPlayer', %line, firstWord($MLTextMousePoint));
// }
/////////////////////////////////////////////////////////////////////////////////
	
