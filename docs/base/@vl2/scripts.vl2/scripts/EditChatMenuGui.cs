//------------------------------------------------------------------------------
//
// EditChatMenuGui.cs
//
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
function EditChatMenuGui::onWake( %this )
{
   fillChatMenuTree();
}

//------------------------------------------------------------------------------
function EditChatMenuGui::onSleep( %this )
{
   chatMenuGuiTree.clear();
}

//------------------------------------------------------------------------------
function fillChatMenuTree()
{
   %guiRoot = chatMenuGuiTree.getFirstRootItem();
   %newGuiId = chatMenuGuiTree.insertItem( %guiRoot, "CHAT MENU ROOT", 0 );
   traverseChatMenu( %newGuiId, $RootChatMenu );
   chatMenuGuiTree.expandItem( %newGuiId );
   chatMenuGuiTree.selectItem( %newGuiId );
   chatMenuGuiTree.dirty = false;
}

//------------------------------------------------------------------------------
function traverseChatMenu( %guiID, %menu )
{
   for ( %i = 0; %i < %menu.optionCount; %i++ )
   {
      %text = %menu.option[%i];

      if ( %menu.isMenu[%i] )
      {
         //echo( "** add menu item \"" @ %menu.option[%i] @ "\" **" );
         %newGuiID = chatMenuGuiTree.insertItem( %guiID, %text, 0 );
         traverseChatMenu( %newGuiID, %menu.command[%i] );
      }
      else
      {
         //echo( "** add command item \"" @ %menu.option[%i] @ "\" (" @ %menu.command[%i] @ ") **" );
         %temp = %menu.command[%i];
         %cmdId = getSubStr( %temp, 1, strlen( temp ) - 1 );
         %commandName = $ChatTable[%cmdId].name;
         %text = %text @ " - ( " @ %commandName @ " )";
         chatMenuGuiTree.insertItem( %guiID, %text, %cmdId );
      }
   }
}

//------------------------------------------------------------------------------
function newChatMenu()
{
   chatMenuGuiTree.clear();
   %guiRoot = chatMenuGuiTree.getFirstRootItem();
   chatMenuGuiTree.insertItem( %guiRoot, "CHAT MENU ROOT", 0 );
   chatMenuGuiTree.dirty = true;
}

//------------------------------------------------------------------------------
function saveChatMenu()
{
   //getSaveFilename( "prefs/chatMenu/*.cs", doSaveChatMenu );
   doSaveChatMenu( "customVoiceBinds.cs" );
}

//------------------------------------------------------------------------------
function resetChatMenu()
{
   doLoadChatMenu( "scripts/voiceBinds.cs" );
}

//------------------------------------------------------------------------------
//function loadChatMenu()
//{
//   getLoadFilename( "prefs/chatMenu/*.cs", doLoadChatMenu );
//}

//------------------------------------------------------------------------------
function doSaveChatMenu( %filename )
{
   %filename = fileBase( %filename );
   if ( %filename $= "" )
      return;

   new fileObject( "saveFile" );
   saveFile.openForWrite( "prefs/" @ %filename @ ".cs" );

   // Write a little header...
   saveFile.writeLine( "//------------------------------------------------------------------------------" );
   saveFile.writeLine( "//" );
   saveFile.writeLine( "// Tribes 2 voice chat menu." );
   saveFile.writeLine( "//" );
   saveFile.writeLine( "//------------------------------------------------------------------------------" );
   saveFile.writeLine( " " );

   // Fire off the tree-traversing write function:
   %rootItem = chatMenuGuiTree.getFirstRootItem();
   writeTreeNode( saveFile, chatMenuGuiTree.getChild( %rootItem ) );

   saveFile.close();
   saveFile.delete();

   chatMenuGuiTree.dirty = false;

   MessageBoxOK( "SAVED", "Save successful." );
}

//------------------------------------------------------------------------------
function writeTreeNode( %file, %item )
{
   %temp = chatMenuGuiTree.getItemText( %item );
   %key = getSubStr( firstWord( %temp ), 0, 1 );
   %text = restWords( %temp );
   %command = chatMenuGuiTree.getItemValue( %item );

   if ( strcmp( %command, "0" ) == 0 )
   {
      %file.writeLine( "startChatMenu( \"" @ %key @ " " @ %text @ "\" );" );
      %child = chatMenuGuiTree.getChild( %item );
      if ( %child )
         writeTreeNode( %file, %child );

      %file.writeLine( "endChatMenu(); // " @ %text );
   }
   else
   {
      // Clip the command text off of the string:
      %cmdName = $ChatTable[%command].name;
      %text = getSubStr( %text, 0, strlen( %text ) - strlen( %cmdName ) - 7 );
      %file.writeLine( "addChat( \"" @ %key @ " " @ %text @ "\", '" @ %cmdName @ "' );" );
   }

   %sibling = chatMenuGuiTree.getNextSibling( %item );
   if ( %sibling != 0 )
      writeTreeNode( %file, %sibling );
}

//------------------------------------------------------------------------------
function doLoadChatMenu( %filename )
{
   // Clear existing chat menu:
   chatMenuGuiTree.clear();

   // Load the file...
   activateChatMenu( %filename );
   fillChatMenuTree();
}

//------------------------------------------------------------------------------
function chatMenuGuiTree::onRightMouseDown( %this, %item, %pos )
{
   // launch the action menu...
   chatMenuGuiTree.selectItem( %item );
   ChatMenuItemActionPopup.awaken( %item, %pos );
}

//------------------------------------------------------------------------------
function editSelectedChatMenuItem()
{
   %item = chatMenuGuiTree.getSelectedItem();
   if ( %item != chatMenuGuiTree.getFirstRootItem() )
   {
      %temp = chatMenuGuiTree.getItemText( %item );
      if ( strlen( %temp ) > 0 )
      {
         %key = getSubStr( firstWord( %temp ), 0, 1 );
         %text = restWords( %temp );
         %command = chatMenuGuiTree.getItemValue( %item );
         if ( %command $= "0" )
            editChatMenu( %key, %text, "doEditChatMenu" );
         else
         {
            %temp = strlen( $ChatTable[%command].name ) + 7;
            %text = getSubStr( %text, 0, strlen( %text ) - %temp );
            editChatCommand( %key, %text, %command, "doEditChatCommand" );
         }
      }
   }
}

//------------------------------------------------------------------------------
//------------------------------------------------------------------------------
function ChatMenuItemActionPopup::awaken( %this, %item, %pos )
{
   %this.position = %pos;
   %this.clear();

   %treeRoot = chatMenuGuiTree.getFirstRootItem();
   %isMenu = ( strcmp( chatMenuGuiTree.getItemValue( %item ), "0" ) == 0 );

   if ( %item != %treeRoot )
      %this.addEntry( "Edit", 0 );

   if ( %isMenu )
   {
      %this.addEntry( "Add menu", 1 );
      %this.addEntry( "Add command", 2 );
   }

   if ( chatMenuGuiTree.getPrevSibling( %item ) )
      %this.addEntry( "Move up", 3 );

   if ( chatMenuGuiTree.getNextSibling( %item ) )
      %this.addEntry( "Move down", 4 );

   if ( %item != %treeRoot )
      %this.addEntry( "Delete", 5 );

   if ( %this.numEntries == 0 )
      return;

   Canvas.pushDialog( ChatMenuItemActionDlg );
   %this.forceOnAction();
}

//------------------------------------------------------------------------------
function ChatMenuItemActionPopup::addEntry( %this, %text, %id )
{
   %this.numEntries++;
   %this.add( %text, %id );
}

//------------------------------------------------------------------------------
function ChatMenuItemActionPopup::reset( %this )
{
   %this.numEntries = 0;
   %this.forceClose();
   Canvas.popDialog( ChatMenuItemActionDlg );
}

//------------------------------------------------------------------------------
function ChatMenuItemActionPopup::onSelect( %this, %id, %text )
{
   %item = chatMenuGuiTree.getSelectedItem();

   switch ( %id )
   {
      case 0: // Edit
         %temp = chatMenuGuiTree.getItemText( %item );
         %key = getSubStr( firstWord( %temp ), 0, 1 );
         %text = restWords( %temp );
         %command = chatMenuGuiTree.getItemValue( %item );
         if ( strcmp( %command, "0" ) == 0 )
            editChatMenu( %key, %text, "doEditChatMenu" );
         else
         {
            // Strip the command name from the text:
            %temp = strlen( $ChatTable[%command].name ) + 7;
            %text = getSubStr( %text, 0, strlen( %text ) - %temp );
            editChatCommand( %key, %text, %command, "doEditChatCommand" );
         }
      case 1: // Add menu
         editChatMenu( "", "", "doNewChatMenu" );
      case 2: // Add command
         editChatCommand( "", "", "", "doNewChatCommand" );
      case 3: // Move up
         chatMenuGuiTree.moveItemUp( %item );
         chatMenuGuiTree.dirty = true;
      case 4: // Move down
         %nextItem = chatMenuGuiTree.getNextSibling( %item );
         chatMenuGuiTree.moveItemUp( %nextItem );
         chatMenuGuiTree.dirty = true;
      case 5: // Delete
         chatMenuGuiTree.removeItem( %item );
         chatMenuGuiTree.dirty = true;
   }

   %this.reset();
}

//------------------------------------------------------------------------------
function ChatMenuItemActionPopup::onCancel( %this )
{
   %this.reset();
}

//------------------------------------------------------------------------------
function editChatMenu( %key, %text, %callback )
{
   $ECI::key = %key;
   $ECI::text = %text;
   $ECI::OKCommand = %callback @ "($ECI::key, $ECI::text);";
   Canvas.pushDialog( EditChatMenuDlg );
}

//------------------------------------------------------------------------------
function editChatCommand( %key, %text, %command, %callback )
{
   $ECI::key = %key;
   $ECI::text = %text;
   $ECI::command = %command;
   $ECI::OKCommand = %callback @ "($ECI::key, $ECI::text, $ECI::command);";
   Canvas.pushDialog( EditChatCommandDlg );
}

//------------------------------------------------------------------------------
function doEditChatMenu( %key, %text )
{
   if ( strlen( %key ) && strlen( %text ) )
   {
      Canvas.popDialog( EditChatMenuDlg );
      %item = chatMenuGuiTree.getSelectedItem();
      %newText = %key @ ": " @ %text;
      chatMenuGuiTree.editItem( %item, %newText, "0" );
      checkSiblings( %item );
      chatMenuGuiTree.dirty = true;
   }
   //else
   //   WARN
}

//------------------------------------------------------------------------------
function doEditChatCommand( %key, %text, %command )
{
   if ( strlen( %key ) && strlen( %text ) && isObject( $ChatTable[%command] ) )
   {
      Canvas.popDialog( EditChatCommandDlg );
      %item = chatMenuGuiTree.getSelectedItem();
      %newText = %key @ ": " @ %text @ " - ( " @ $ChatTable[%command].name @ " )";
      chatMenuGuiTree.editItem( %item, %newText, %command );
      checkSiblings( %item );
      chatMenuGuiTree.dirty = true;
   }
   //else
   //   WARN
}

//------------------------------------------------------------------------------
function doNewChatMenu( %key, %text )
{
   if ( strlen( %key ) && strlen( %text ) )
   {
      Canvas.popDialog( EditChatMenuDlg );
      %item = chatMenuGuiTree.getSelectedItem();
      %newText = %key @ ": " @ %text;
      %newItem = chatMenuGuiTree.insertItem( %item, %newText, "0" );
      chatMenuGuiTree.expandItem( %item );
      chatMenuGuiTree.selectItem( %newItem );
      checkSiblings( %newItem );
      chatMenuGuiTree.dirty = true;
   }
   //else
   //   WARN
}

//------------------------------------------------------------------------------
function doNewChatCommand( %key, %text, %command )
{
   if ( strlen( %key ) && strlen( %text ) && isObject( $ChatTable[%command] ) )
   {
      Canvas.popDialog( EditChatCommandDlg );
      %item = chatMenuGuiTree.getSelectedItem();
      %newText = %key @ ": " @ %text @ " - ( " @ $ChatTable[%command].name @ " )";
      %newItem = chatMenuGuiTree.insertItem( %item, %newText, %command );
      chatMenuGuiTree.expandItem( %item );
      chatMenuGuiTree.selectItem( %newItem );
      checkSiblings( %newItem );
      chatMenuGuiTree.dirty = true;
   }
   //else
   //   WARN
}


//------------------------------------------------------------------------------
//------------------------------------------------------------------------------
function EditChatMenuDlg::onWake( %this )
{
}

//------------------------------------------------------------------------------
function EditChatCommandDlg::onWake( %this )
{
   // Fill the command popup list:
   EditChatCommandList.clear();
   for ( %i = $MinChatItemId; %i <= $MaxChatItemId; %i++ )
   {
      if ( isObject( $ChatTable[%i] ) )
         EditChatCommandList.add( $ChatTable[%i].name, %i );
   }
   EditChatCommandList.sort( true );

   // Select the current command:
   if ( isObject( $ChatTable[$ECI::command] ) )
   {
      EditChatCommandList.setSelected( $ECI::command );
      EditChatCommandMessage.setText( $ChatTable[$ECI::command].text );
      ChatCommandTestBtn.setVisible( true );
   }
   else
   {
      EditChatCommandList.setText( "Select command" );
      EditChatCommandMessage.setText( " " );
      ChatCommandTestBtn.setVisible( false );
   }
}

//------------------------------------------------------------------------------
function EditChatCommandList::onSelect( %this, %index, %value )
{
   $ECI::command = %index;
   EditChatCommandMessage.setText( $ChatTable[%index].text );
   ChatCommandTestBtn.setVisible( true );
}

//------------------------------------------------------------------------------
function checkSiblings( %item )
{
   %allClear = true;
   %sibling = chatMenuGuiTree.getPrevSibling( %item );
   while ( %sibling != 0 )
   {
      %siblingKey = getSubStr( firstWord( chatMenuGuiTree.getItemText( %sibling ) ), 0, 1 );
      if ( %siblingKey $= $ECI::key )
      {
         %allClear = false;
         break;
      }
      %sibling = chatMenuGuiTree.getPrevSibling( %sibling );
   }

   if ( %allClear )
   {
      %sibling = chatMenuGuiTree.getNextSibling( %item );
      while ( %sibling != 0 )
      {
         %siblingKey = getSubStr( firstWord( chatMenuGuiTree.getItemText( %sibling ) ), 0, 1 );
         if ( %siblingKey $= $ECI::key )
         {
            %allClear = false;
            break;
         }
         %sibling = chatMenuGuiTree.getNextSibling( %sibling );
      }
   }

   if ( !%allClear )
   {
      if ( chatMenuGuiTree.getItemValue( %item ) $= "0" )
         %text1 = restWords( chatMenuGuiTree.getItemText( %item ) );
      else
      {
         %temp = chatMenuGuiTree.getItemText( %item );
         %text1 = getWords( %temp, 1, getWordCount( %temp ) - 5 );
      }

      if ( chatMenuGuiTree.getItemValue( %sibling ) $= "0" )
         %text2 = restWords( chatMenuGuiTree.getItemText( %sibling ) );
      else
      {
         %temp = chatMenuGuiTree.getItemText( %sibling );
         %text2 = getWords( %temp, 1, getWordCount( %temp ) - 5 );
      }

      MessageBoxOK( "WARNING", "Menu siblings \"" @ %text1 @ "\" and \"" @ %text2 @ "\" are both bound to the \'" @ %siblingKey @ "\' key!" );
   }

   return %allClear;
}

//------------------------------------------------------------------------------
function testChatCommand( %command )
{
   // Play the sound:
   if ( $pref::Player::Count > 0 )
      %voiceSet = getField( $pref::Player[$pref::Player::Current], 3 );
   else
      %voiceSet = "Male1";

   ChatCommandTestBtn.setActive( false );
   %wav = "voice/" @ %voiceSet @ "/" @ $ChatTable[%command].audioFile @ ".wav";   
   %handle = alxCreateSource( AudioChat, %wav );
   alxPlay( %handle );
   %delay = alxGetWaveLen( %wav );
   schedule( %delay, 0, "restoreCommandTestBtn" );   
}

//------------------------------------------------------------------------------
function restoreCommandTestBtn()
{
   ChatCommandTestBtn.setActive( true );
}

//------------------------------------------------------------------------------
function leaveChatMenuEditor()
{
   if ( chatMenuGuiTree.dirty )
      MessageBoxYesNo( "CHANGES", "Do you want to save your changes?", 
         "saveChatMenu(); reallyLeaveChatMenuEditor();", 
         "reallyLeaveChatMenuEditor();" );
   else
      reallyLeaveChatMenuEditor();
}

//------------------------------------------------------------------------------
function reallyLeaveChatMenuEditor()
{
   activateChatMenu( "prefs/customVoiceBinds.cs" );
   Canvas.popDialog( EditChatMenuGui );
   Canvas.pushDialog( OptionsDlg );
}


