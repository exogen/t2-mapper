//------------------------------------------------------------------------------
//
// TrainingGui.cs
//
//------------------------------------------------------------------------------

//------------------------------------------------------------------------------
function LaunchTraining()
{
   LaunchTabView.viewTab( "TRAINING", TrainingGui, 0 );
}

//------------------------------------------------------------------------------
function TrainingGui::onWake( %this )
{
   Canvas.pushDialog( LaunchToolbarDlg );

	%this.soundHandle = 0;
	%this.briefEventCount = 0;
	%this.briefWAV = "";
   %ct = 1;
	%fobject = new FileObject();
   %search = "missions/*.mis";
   TrainingMissionList.clear();
   for ( %file = findFirstFile( %search ); %file !$= ""; %file = findNextFile( %search ) )
   {
      %name = fileBase(%file); // get the mission name

      if ( !%fobject.openForRead( %file ) )
         continue;

		%typeList = "None";

      while( !%fobject.isEOF() )
      {
         %line = %fobject.readLine();
         if ( getSubStr( %line, 0, 18 ) $= "// MissionTypes = " )
         {
            %typeList = getSubStr( %line, 18, 1000 );
            break;
         }
      }

		if ( strstr( %typeList, "SinglePlayer" ) != -1 )
      {
         // Get the mission display name:
         %displayName = %name;
         while ( !%fobject.isEOF() )
         {
            %line = %fobject.readLine();
            if ( getSubStr( %line, 0, 16 ) $= "// PlanetName = " )
            {
               %displayName = getSubStr( %line, 16, 1000 );
               // Strip the date:
               %pos = strpos( %displayName, "," );
               if ( %pos != -1 )
                  %displayName = getSubStr( %displayName, 0, %pos );
               break;
            }
         }

      	TrainingMissionList.addRow( %ct++, %displayName TAB %name );
      }

      %fobject.close();
   }

	TrainingMissionList.sort( 1 );
   TrainingMissionList.setSelectedRow( 0 );
   if ( $pref::TrainingDifficulty > 0 && $pref::TrainingDifficulty < 4 )
      TrainingDifficultyMenu.setSelected( $pref::TrainingDifficulty );
   else
      TrainingDifficultyMenu.setSelected( 1 );
}

//------------------------------------------------------------------------------
function TrainingGui::onSleep( %this )
{
	%this.stopBriefing();

	Canvas.popDialog(LaunchToolbarDlg);
}

//------------------------------------------------------------------------------
function TrainingGui::setKey( %this )
{
}

//------------------------------------------------------------------------------
function TrainingGui::onClose( %this )
{
}

//------------------------------------------------------------------------------
function TrainingDifficultyMenu::onAdd( %this )
{
   %this.add( "Easy", 1 );
   %this.add( "Medium", 2 );
   %this.add( "Hard", 3 );
}

//------------------------------------------------------------------------------
function TrainingDifficultyMenu::onSelect( %this, %id, %text )
{
   $pref::TrainingDifficulty = %id;
}

//------------------------------------------------------------------------------
function TrainingMissionList::onSelect( %this, %id, %text )
{
	TrainingGui.stopBriefing();
   %fileName = "missions/" @ getField( %text, 1 ) @ ".mis";
   %file = new FileObject();
   %state = 0;
   if ( %file.openForRead( %fileName ) )
   {
		// Get the mission briefing text:
      while ( !%file.isEOF() )
      {
         %line = %file.readLine();
         if ( %state == 0 && %line $= "//--- MISSION BRIEFING BEGIN ---" )
            %state = 1;
         else if ( %state > 0 && %line $= "//--- MISSION BRIEFING END ---" )
            break;
         else if ( %state == 1 )
			{
            %briefText = %briefText @ getSubStr( %line, 2, 1000 );
				%state = 2;
			}
         else if ( %state == 2 )
            %briefText = %briefText NL getSubStr( %line, 2, 1000 );
      }

		// Get the mission briefing WAV file:
		while ( !%file.isEOF() )
		{
         %line = %file.readLine();
			if ( getSubStr( %line, 0, 17 ) $= "// BriefingWAV = " )
         {
				%briefWAV = getSubStr( %line, 17, 1000 );
            break;
         }
		}

		// Get the bitmap name:
		while ( !%file.isEOF() )
		{
         %line = %file.readLine();
			if ( getSubStr( %line, 0, 12 ) $= "// Bitmap = " )
         {
				%briefPic = getSubStr( %line, 12, 1000 );
            break;
         }
		}

      %file.close();
   }
	else
		error( "Failed to open Single Player mission file " @ %fileName @ "!" );

   if (!isDemo())
      %bmp = "gui/" @ %briefPic @ ".png";
   else
      %bmp = "gui/" @ %briefPic @ ".bm8";
   if ( isFile( "textures/" @ %bmp ) )
   {
      TrainingPic.setBitmap( %bmp );
      TrainingPicFrame.setVisible( true );
   }
   else
   {
      TrainingPic.setBitmap( "" );
      TrainingPicFrame.setVisible( false );
   }

	TrainingPlayBtn.setActive( %briefWAV !$= "" );
   TrainingBriefingText.setValue( %briefText );
	TrainingBriefingScroll.scrollToTop();
	TrainingGui.WAVBase = firstWord( %briefWAV );
	TrainingGui.WAVCount = restWords( %briefWAV );
   %file.delete();

   //if ( TrainingPlayTgl.getValue() )
   //   TrainingGui.startBriefing();
}

//------------------------------------------------------------------------------
function TrainingPlayTgl::onAction( %this )
{
   if ( %this.getValue() )
   {
      if ( TrainingMissionList.getSelectedId() != -1 )
         TrainingGui.startBriefing();
   }
   else
      TrainingGui.stopBriefing();
}

//--------------------------------------------------------
function TrainingGui::toggleBriefing( %this )
{
   if ( %this.soundHandle $= "" )
      %this.startBriefing();
   else
      %this.stopBriefing();
}

//--------------------------------------------------------
function TrainingGui::startBriefing( %this )
{
	%this.stopBriefing();
   if ( %this.WAVBase !$= "" )
   {
      %this.instance = %this.instance $= "" ? 0 : %this.instance;
	   %this.playNextBriefWAV( %this.WAVBase, 0, %this.WAVCount, %this.instance );
   }
}

//--------------------------------------------------------
function TrainingGui::playNextBriefWAV( %this, %wavBase, %id, %count, %instance )
{
	if ( %instance == %this.instance )
	{
      if ( %id < %count )
      {
		   %wav = "voice/Training/Briefings/" @ %wavBase @ ".brief0" @ ( %id + 1 ) @ ".wav";
	      %this.soundHandle = alxCreateSource( AudioGui, %wav );
	      alxPlay( %this.soundHandle );

	      // Schedule the next WAV:
		   %delay = alxGetWaveLen( %wav ) + 500;
		   %this.schedule( %delay, playNextBriefWAV, %wavBase, %id + 1, %count, %instance );
      }
      else
      {
         // We're all done!
         %this.soundHandle = "";
      }
	}
}

//--------------------------------------------------------
function TrainingGui::stopBriefing( %this )
{
	if ( %this.soundHandle !$= "" )
	{
		alxStop( %this.soundHandle );
		%this.soundHandle = "";
		%this.instance++;
	}
}

//--------------------------------------------------------
function TrainingGui::startTraining( %this )
{
   MessagePopup( "STARTING MISSION", "Initializing, please wait..." );
   Canvas.repaint();
   cancelServerQuery();
   %file = getField( TrainingMissionList.getValue(), 1 );
	$ServerName = "Single Player Training";
   $HostGameType = "SinglePlayer";
   CreateServer( %file, "SinglePlayer" );
   localConnect( "Lone Wolf", "Human Male", "swolf", "Male1" );
}
