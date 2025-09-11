//------------------------------------------------------------------------------
//
// DebriefGui.cs
//
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
function DebriefGui::onWake( %this )
{
   moveMap.pop();
   if ( isObject( passengerKeys ) )
      passengerKeys.pop();
   if ( isObject( observerBlockMap ) )
      observerBlockMap.pop();
   if ( isObject( observerMap ) )
      observerMap.pop();
   //flyingCameraMove.pop();

   if ( isObject( debriefMap ) )
   {
      debriefMap.pop();
      debriefMap.delete();
   }
   new ActionMap( debriefMap );
   %bind = moveMap.getBinding( toggleMessageHud );
   debriefMap.bind( getField( %bind, 0 ), getField( %bind, 1 ), toggleDebriefChat );
   debriefMap.copyBind( moveMap, activateChatMenuHud );
   debriefMap.bindCmd( keyboard, escape, "", "debriefContinue();" );
   debriefMap.push();
      
   DB_ChatVector.attach( HudMessageVector );
   DB_ChatScroll.scrollToBottom();
   DB_LoadingProgress.setValue( 0 );
   LoadingProgress.setValue( 0 );
   DB_LoadingProgressTxt.setValue( "LOADING MISSION" );
   LoadingProgressTxt.setValue( "LOADING MISSION" );
}

//------------------------------------------------------------------------------
function DebriefGui::onSleep( %this )
{
   debriefMap.pop();
   debriefMap.delete();
}

//------------------------------------------------------------------------------
function DebriefResultText::onResize( %this, %width, %height )
{
   %fieldHeight = getWord( DB_ResultPane.getExtent(), 1 );
   %x = getWord( DB_ResultScroll.getPosition(), 0 );
   %w = getWord( DB_ResultScroll.getExtent(), 0 );
   %h = %fieldHeight - %height - 4;
   DB_ResultScroll.resize( %x, %height + 2, %w, %h );
}

//------------------------------------------------------------------------------
function toggleDebriefChat()
{
   Canvas.pushDialog( DB_ChatDlg );
}

//------------------------------------------------------------------------------
function DB_ChatDlg::onWake( %this )
{
   DB_ChatEntry.setValue( "" );
}

//------------------------------------------------------------------------------
function DB_ChatEntry::onEscape( %this )
{
   Canvas.popDialog( DB_ChatDlg );
}

//------------------------------------------------------------------------------
function DB_ChatEntry::sendChat( %this )
{
   %text = %this.getValue();
   if ( %text !$= "" )
      commandToServer( 'MessageSent', %text );

   Canvas.popDialog( DB_ChatDlg );
}

//------------------------------------------------------------------------------
function debriefDisconnect()
{
   MessageBoxYesNo( "DISCONNECT", "Are you sure you want to leave this game?", "Disconnect();" );
}

//------------------------------------------------------------------------------
function debriefContinue()
{
   checkGotLoadInfo();
}

//------------------------------------------------------------------------------
addMessageCallback( 'MsgGameOver', handleGameOverMessage );
addMessageCallback( 'MsgClearDebrief', handleClearDebriefMessage );
addMessageCallback( 'MsgDebriefResult', handleDebriefResultMessage );
addMessageCallback( 'MsgDebriefAddLine', handleDebriefLineMessage );

//------------------------------------------------------------------------------
function handleGameOverMessage( %msgType, %msgString )
{
   weaponsHud.clearAll();
   inventoryHud.clearAll();

   // Fill the Debriefer up with stuff...
   Canvas.setContent( DebriefGui );
}

function handleClearDebriefMessage( %msgType, %msgString )
{
   DebriefResultText.setText( "" );
   DebriefText.setText( "" );
}

//------------------------------------------------------------------------------
function handleDebriefResultMessage( %msgType, %msgString, %string )
{
   %text = DebriefResultText.getText();
   if ( %text $= "" )
      %newText = detag( %string );
   else
      %newText = %text NL detag( %string );
   DebriefResultText.setText( %newText );
}

//------------------------------------------------------------------------------
function handleDebriefLineMessage( %msgType, %msgString, %string )
{
   %text = DebriefText.getText();
   if ( %text $= "" )
      %newText = detag( %string );
   else
      %newText = %text NL detag( %string );
   DebriefText.setText( %newText );
}
