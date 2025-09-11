//------------------------------------------------------------------------------
//
// commonDialogs.cs
//
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
// MessageBox OK dialog:
//------------------------------------------------------------------------------
function MessageBoxOK( %title, %message, %callback )
{
	MBOKFrame.setTitle( %title );
   MBOKText.setText( "<just:center>" @ %message );
   //MessageBoxOKDlg.callback = %callback;
   MBOKButton.command = %callback SPC "Canvas.popDialog(MessageBoxOKDlg);";
   Canvas.pushDialog( MessageBoxOKDlg );
}

//------------------------------------------------------------------------------
function MessageBoxOKDlg::onWake( %this )
{
}

//------------------------------------------------------------------------------
function MessageBoxOKDlg::onSleep( %this )
{
   %this.callback = "";
}

//------------------------------------------------------------------------------
// MessageBox OK/Cancel dialog:
//------------------------------------------------------------------------------
function MessageBoxOKCancel( %title, %message, %callback, %cancelCallback )
{
	MBOKCancelFrame.setTitle( %title );
   MBOKCancelText.setText( "<just:center>" @ %message );
	//MessageBoxOKCancelDlg.callback = %callback;
	//MessageBoxOKCancelDlg.cancelCallback = %cancelCallback;
	MBOKCancelButtonOK.command = %callback SPC "Canvas.popDialog(MessageBoxOKCancelDlg);";
	MBOKCancelButtonCancel.command = %cancelCallback SPC "Canvas.popDialog(MessageBoxOKCancelDlg);";

   Canvas.pushDialog( MessageBoxOKCancelDlg );
}

//------------------------------------------------------------------------------
function MessageBoxOKCancelDlg::onWake( %this )
{
}

//------------------------------------------------------------------------------
function MessageBoxOKCancelDlg::onSleep( %this )
{
   %this.callback = "";
}

//------------------------------------------------------------------------------
// MessageBox Yes/No dialog:
//------------------------------------------------------------------------------
function MessageBoxYesNo( %title, %message, %yesCallback, %noCallback )
{
	MBYesNoFrame.setTitle( %title );
   MBYesNoText.setText( "<just:center>" @ %message );

	//MessageBoxYesNoDlg.yesCallBack = %yesCallback;
	//MessageBoxYesNoDlg.noCallback = %noCallBack;
	MBYesNoButtonYes.command = %yesCallback SPC "Canvas.popDialog(MessageBoxYesNoDlg);";
	MBYesNoButtonNo.command = %noCallback SPC "Canvas.popDialog(MessageBoxYesNoDlg);";
   Canvas.pushDialog( MessageBoxYesNoDlg );
}

//------------------------------------------------------------------------------
function MessageBoxYesNoDlg::onWake( %this )
{
}

//------------------------------------------------------------------------------
function MessageBoxYesNoDlg::onSleep( %this )
{
   %this.yesCallback = "";
   %this.noCallback = "";
}

//------------------------------------------------------------------------------
// Message popup dialog:
//------------------------------------------------------------------------------
function MessagePopup( %title, %message, %delay )
{
   // Currently two lines max.
   MessagePopFrame.setTitle( %title );
   MessagePopText.setText( "<just:center>" @ %message );
   Canvas.pushDialog( MessagePopupDlg );
   if ( %delay !$= "" )
      schedule( %delay, 0, CloseMessagePopup );
}

//------------------------------------------------------------------------------
function CloseMessagePopup()
{
   Canvas.popDialog( MessagePopupDlg );
}

//------------------------------------------------------------------------------
// Pick Team dialog:
//------------------------------------------------------------------------------
function PickTeamDlg::onWake( %this )
{
}

//------------------------------------------------------------------------------
function PickTeamDlg::onSleep( %this )
{
}

//------------------------------------------------------------------------------
// ex: ShellGetLoadFilename( "stuff\*.*", isLoadable, loadStuff );
//     -- only adds files that pass isLoadable
//     -- calls 'loadStuff(%filename)' on dblclick or ok
//------------------------------------------------------------------------------
function ShellGetLoadFilename( %title, %fileSpec, %validate, %callback )
{
   $loadFileCommand = %callback @ "( getField( LOAD_FileList.getValue(), 0 ) );";
	LOAD_FileList.altCommand = $loadFileCommand SPC "Canvas.popDialog(ShellLoadFileDlg);";
   LOAD_LoadBtn.command = $loadFileCommand SPC "Canvas.popDialog(ShellLoadFileDlg);";

   if ( %title $= "" )
      LOAD_Title.setTitle( "LOAD FILE" );
   else
      LOAD_Title.setTitle( %title );
   LOAD_LoadBtn.setActive( false );
   Canvas.pushDialog( ShellLoadFileDlg );
   fillLoadSaveList( LOAD_FileList, %fileSpec, %validate, false );
}

//------------------------------------------------------------------------------
function fillLoadSaveList( %ctrl, %fileSpec, %validate, %isSave )
{
   %ctrl.clear();
   %id = 0;
   for ( %file = findFirstFile( %fileSpec ); %file !$= ""; %file = findNextFile( %fileSpec ) )
   {
      if ( %validate $= "" || call( %validate, %file ) )
      {
         %ctrl.addRow( %id, fileBase( %file ) TAB %file );
         if ( %isSave )
         {
            if ( !isWriteableFileName( "base/" @ %file ) )
               %ctrl.setRowActive( %id, false );
         }
         %id++;
      }
   }
   %ctrl.sort( 0 );
}

//------------------------------------------------------------------------------
function LOAD_FileList::onSelect( %this, %id, %text )
{
   LOAD_LoadBtn.setActive( true );
}

//------------------------------------------------------------------------------
// ex: ShellGetSaveFilename( "stuff\*.*", isLoadable, saveStuff, currentName );
//     -- only adds files to list that pass isLoadable
//     -- calls 'saveStuff(%filename)' on dblclick or ok
//------------------------------------------------------------------------------
function ShellGetSaveFilename( %title, %fileSpec, %validate, %callback, %current )
{
   SAVE_FileName.setValue( %current );
   $saveFileCommand = "if ( SAVE_FileName.getValue() !$= \"\" ) " @ %callback @ "( SAVE_FileName.getValue() );";
	SAVE_FileName.altCommand = $saveFileCommand SPC "Canvas.popDialog(ShellSaveFileDlg);";
	SAVE_SaveBtn.command = $saveFileCommand SPC "Canvas.popDialog(ShellSaveFileDlg);";

   if ( %title $= "" )
      SAVE_Title.setTitle( "SAVE FILE" );
   else
      SAVE_Title.setTitle( %title );

   // Right now this validation stuff is worthless...
   //SAVE_SaveBtn.setActive( isWriteableFileName( "base/" @ %current @ $loadSaveExt ) );
   Canvas.pushDialog( ShellSaveFileDlg );
   fillLoadSaveList( SAVE_FileList, %fileSpec, %validate, true );
}

//------------------------------------------------------------------------------
function SAVE_FileList::onSelect( %this, %id, %text )
{
   if ( %this.isRowActive( %id ) )
      SAVE_FileName.setValue( getField( %this.getValue(), 0 ) );
}

//------------------------------------------------------------------------------
function SAVE_FileList::onDoubleClick( %this )
{
   %id = %this.getSelectedId();
   if ( %this.isRowActive( %id ) )
   {
      error("D'oh - double clicking is broken for PURE/DEMO executables");
      eval( $saveFileCommand ); 
      Canvas.popDialog( ShellSaveFileDlg );
   }
}

//------------------------------------------------------------------------------
function SAVE_FileName::checkValid( %this )
{
   // Right now this validation stuff is worthless...
   //SAVE_SaveBtn.setActive( isWriteableFileName( "base/" @ %this.getValue() @ $loadSaveExt ) );
}
