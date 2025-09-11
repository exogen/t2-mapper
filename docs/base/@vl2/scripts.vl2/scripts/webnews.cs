$WebLinkCount = 0;
$currentPage = 0;
$newsCacheVersion = 1;

if (!isObject(NewsVector))
	new MessageVector(NewsVector);

function LaunchNews()
{
   LaunchTabView.viewTab( "NEWS", NewsGui, 0 );
}
//-----------------------------------------------------------------------------
function updatePageBtn(%prev,%next)
{		
   NewsPrevBtn.setVisible( 0 );
   NewsNextBtn.setVisible( 0 );
//   NewsPrevBtn.setActive( %prev );
//   NewsNextBtn.setActive( %next );
}
//-----------------------------------------------------------------------------
function NewsGui::onAdd(%this)
{
	NewsGui.tabsLoaded = 0;
	if(!isDemo())
	{
	   if(!isObject(NCHGroup))
	       new SimGroup(NCHGroup);
	}
}
//-----------------------------------------------------------------------------
function NewsGui::onWake(%this)
{
	Canvas.pushDialog(LaunchToolbarDlg);
	%this.set = 1; // signifies the first (latest) set
	if ( isDemo() )
	{
      if ( !%this.oneTimeOnly )
      {
         %this.oneTimeOnly = 1;
         NewsPrevBtn.setVisible( false );
         NewsNextBtn.setVisible( false );
         NewsSubmitBtn.setVisible( false );
         NewsMOTDText.setValue( "Welcome to the Tribes 2 Demo!" );
         %this.addStaticArticle( "What's In This Demo?", "There are two training missions, and two multiplayer maps in this demo.\n\nIf you're new to the Tribes experience, you should consider trying out the training missions so you can become familiar with the basics of the game. Then, after you learn how to use your jets and weapons, jump into multiplayer on one of our Demo Servers to fight against other players like yourself." );
         %this.addStaticArticle( "What Do I Do First?", "As a suggestion, you might consider checking out the on-line manual first. That manual is available at our 'Tribes 2 Central Download' website (www.tribes2centraldownload.com) in the 'T2 Manual' sub-folder. After you take a look at the manual, you should definitely try out the first two Training Missions. They'll give you most of the basics that you need to know in order to play competitively on-line. Of course, then you should go enter the mayhem known as Tribes and have a blast gaming against other players." );
         %this.addStaticArticle( "Where are the Options?", "There is a LAUNCH button in the lower left of this screen. Click on it and choose the SETTINGS option. There you will find ways to modify your graphics, textures, network settings, key configurations and more.\n\nMost of these settings will be configured automatically based on your system's hardware, so try the game with the default settings for a while and see how it plays. Then, optimize your settings accordingly thereafter." );
         %this.addStaticArticle( "What is Capture the Flag?", "Many of you have played versions of Capture the Flag (CTF) in real-life or in other computer games. Tribes 2's version is quite similar to what you're used to playing.\n\nThe object is to go grab the other team's flag and return it to your own base by taking it to your flag's position. Your team scores points for capturing the flag and some minor (tie-breaking) points for touching it.\n\nThe game has many roles and is definitely the most popular of the T2 games. You can play defense by setting up turret perimeters, deploying sensors and guarding the flag, or load three people into a bomber and make bombing runs over the enemy base, or many other things.\n\nTry them all out. There's certainly a role in there for you somewhere." );
         %this.addStaticArticle( "What is Hunters?", "Unlike CTF, Hunters is an individual game rather than a team game. The object of the game is to destroy other players, thus causing them to drop all the flags they are carrying. Each person carries at least one flag at all times, but the players that gather the most flags are the biggest targets.\n\nWhen you have a bunch of flags, take them to the 'Nexus'. The Nexus is waypointed with a marker on your HUD and is a column of glowing light. You can't miss it. Run through that column and you'll score points for the flags you carry.\n\nThe scoring for flags is a curve, so the more flags you carry, the more points you will score. Large amounts of flags can create very high scores if you capture them all at once." );
         %this.addStaticArticle( "What is the Full Version Like?", "There are six different game types, five different worlds, six vehicles, a whole slew of voices and tribe skins, all the weapons you saw in the demo, and 53 different maps. There's an on-line community with constantly updated News, Forums, Chat, Email, and a Player/Tribe Browser so that the whole community is at your fingertips. Also the Tribes player community is thriving. Player-created scripts, game mods, and maps are plentiful and high-quality. In short, it's much, much more than what you see in this demo." );
         %this.addStaticArticle( "What Video Drivers Do I Use?", "Please check your video card company's website for the latest video driver information.\n\nWe advise against the use of beta drivers. They often cause problems for our current players and should be avoided." );
         %this.addStaticArticle( "How to Tweak Framerate", "There are many graphic options in the game. If you are experiencing low framerate for some reason, there are two main areas you should try out.\n\nIf your CPU is relatively slow, then you should try turning down all the options associated with polygon count. These are listed in SETTINGS/GRAPHICS. You might also try a lower screen resolution, or even 16-bit color. 16-bit color has the side effect of using 16-bit z-buffering, which isn't as nice as 32-bit, but it's much faster.\n\nIf your video card doesn't have much VRAM, then you should consider turning down the options that use a lot of texture memory. These are found in SETTINGS/TEXTURES." );
         %this.addStaticArticle( "A Small Disclaimer", "This NEWS page is static, unlike the one in the real game. In otherwords, don't expect the constant community updates and news items that you will get after you buy the full version. ;)" );
         if ( WebLinksMenu.size() == 0 )
  	         WebLinksMenu.defaultList();	
      }   
   }
	else
	{
	   Canvas.SetCursor(ArrowWaitCursor);
		if (NewsTabGroup.tabCount() == 0)
		{
			NewsGui.startup = 1;
			NewsTabGroup.addTab( 105, "FRONT PAGE", 1);
			NewsTabGroup.addTab( 35500, "EVENTS");
			NewsTabGroup.addTab( 35501, "SPORTS");
			NewsTabGroup.addTab( 35503, "TECH");
			NewsTabGroup.addTab( 35504, "EDITORIAL");
			NewsTabGroup.lastID = 0;

			// Fetch the News
			NewsTabGroup.setSelected( 105 ); // Select the tab by ID
			NewsTabGroup.onSelect(105,"FRONT PAGE");			

		   // Fetch the message of the day:
		   NewsMOTDText.key = LaunchGui.key++;
		   NewsMOTDText.state = "isvalid";
		   DatabaseQuery(0,"",NewsMOTDText,NewsMOTDText.key);

			weblinksmenu.clear();
			weblinksmenu.key = launchGui.key++;
			weblinksmenu.state = "fetchWeblink";
			DatabaseQueryArray(15,0,"WEBLINK",weblinksmenu,weblinksmenu.key);

			for(%ch=0; %ch<5; %ch++)
			{
				// ID.NAME.UPDATEID.ALLREAD.ARTICLECOUNT.LASTUPDATED
				AddCatHeader(NewsTabGroup.getTabId(%ch), NewsTabGroup.getTabText(%ch), 0,0,"");
			}
		}
	}
	if (!NewsTabGroup.lastID)
		NewsTabGroup.lastID = 105;
	if (!NewsGui.startup)
		NewsGui.startup = 0;

   WebLinksMenu.setSelected( 0 );
   NewsPrevBtn.setActive( false );
   NewsNextBtn.setActive( false );
}
//-----------------------------------------------------------------------------
function NewsGui::onSleep(%this)
{
   Canvas.popDialog(LaunchToolbarDlg);
}
//-----------------------------------------------------------------------------
function NewsGui::setKey( %this, %key )
{
}
//-----------------------------------------------------------------------------
function NewsGui::onClose( %this, %key )
{
}
//-----------------------------------------------------------------------------
function NewsGui::rebuildText(%this)
{
	NewsHeadlines.clear();
	for(%i = 0; %i < %this.articleCount; %i++)
	{	  
   	%article = %this.article[%i];

	if ( isDemo() )
	{
		%topic = getField( %article, 0 );
		%body = getFields( %article, 1 );

		%text = %text @ "<lmargin:10><color:adfffa><font:univers:22><tag:" @ %i @ ">"
		@ %topic
		@ "<lmargin:30><rmargin%:80><color:82beb9><font:univers:16>\n"
		NL %body
		@ "<sbreak>\n\n<rmargin%:100>";
	}
	else
	{
		%ai = wonGetAuthInfo();
		%isMem = 0;
		for(%east=0;%east<getField(getRecord(%ai,1),0);%east++)
		{
			%tpv = GetRecord(%ai,2+%east);
			if(getField(%tpv,3)==1401 || getField(%tpv,3)==1402)
			%isMem = 1;
		}
		%editable = %isMem;
		%topicid = getField(%article,1);
		%articleid = getField(%article, 2);
		%postcount = getField(%article,3)-1;
		%date = getField(%article,4);
		%update_id = getField(%article,5);
		%author_id = getField(%article,6);
		%nameLink = getLinkName(getField(%article,8) TAB getField(%article,9) TAB getField(%article,10) TAB getField(%article,11),0);
		%category = getField(%article, 12);
		%topic = getField(%article, 13);
		%body = getFields(%article,14);
		%rc = getRecordCount(%body);
		%atxt = "";

		if ($newsCacheVersion && $newsCacheVersion == 1)
		{
			switch(%category)
			{
				case 105: %nLink = "Front Page";
				case 35500: %nLink = "Events";
				case 35501: %nLink = "Sports";
				case 35503: %nLink = "Tech";
				case 35504: %nLink = "Editorial";
			}
			%forumLinkName = "News-" @ %nLink;
		}
		else
			%forumLinkName = "NEWS";

      	if ( %editable )
		   {
         	%editText = "<a:editnews" TAB %i TAB %topicid TAB %articleid TAB %author_id TAB %update_id @
						">[edit]</a> <a:deletenews" TAB %i TAB %articleid TAB %topicid @
		     		    ">[delete]</a> <a:forumlink" TAB %forumLinkName TAB %articleid TAB %topic @ ">[comments ("@%postcount@")]</a>";
		   }
      	else
         	%editText = "<a:forumlink" TAB "NEWS" TAB %articleid TAB %topic @
		     					">[comments ("@%postcount@"]</a>";

      	for(%l = 0; %l < %rc; %l++)
         	%atxt = %atxt @ getRecord(%body,%l) @ "\n";

      	%text = %text @ "<lmargin:10><color:ADFFFA><font:Univers:22><tag:" @ %i @ ">" @
                 %topic @ " <font:Univers Condensed:18>" @ %editText @ "\nPosted by: " @ %nameLink @ " on " @ %date NL
                 "\n<lmargin:30><rmargin%:80><font:Univers:16><color:82BEB9>" @ %atxt @ "<sbreak>\n\n<rmargin%:100>";
		}

      NewsHeadlines.addRow( %i, %topic );
   }
   NewsText.setValue(%text);
   NewsHeadlines.setSelectedRow(0);
}
//-----------------------------------------------------------------------------
function NewsGui::onDatabaseQueryResult(%this, %status, %RowCount_Result, %key)
{
	if(%key != %this.key)
    	return;
   	%this.maxDate = " ";
	%this.minDate = " ";

	if(getField(%status,0)==0)
	{
		switch$(%this.caller)
		{
			case "GETNEWS": // record count
					NewsText.setValue("");
					NewsHeadlines.clear();
					%this.articleCount = 0;
		   		%this.acl = getField(%status,3);
					%this.ttlRecords = getField( %status,2 );
					%this.recordCount = getField( %RowCount_Result,0 );
					if(%this.recordCount > 23)
					{
						if($currentPage == 0)
							updatePageBtn(0,1);
						else if($currentPage > 0)
							updatePageBtn(1,1);
					}
					else
					{
						if($currentPage == 0)
							updatePageBtn(0,0);
						else if($currentPage > 0)
							updatePageBtn(1,0);
					}
						
			default: // result string
		}
	}
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "error";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
	{
    	%this.state = "halt";		
  	     MessageBoxOK("NOTICE",getField(%status,1));
	}
	Canvas.setCursor(DefaultCursor);
}
//-----------------------------------------------------------------------------
function NewsGui::onDatabaseRow(%this, %row,%isLastRow,%key)
{
   if ( %key != %this.key )
    	return;

   if ( %this.articleCount $= "" )
      %this.articleCount = 0;
      
	%this.article[%this.articleCount] = %row;
	%this.recordSet--;
	if ( %this.articleCount == 0 )
	{
		%this.maxDate = getField( %this.article[%this.articleCount],4);
     	%this.Max = getField(%this.article[%this.articleCount],5);
	}
			
	if ( %this.recordSet == 0 )
	{
		%this.minDate = getField( %this.article[%this.articleCount],4);
     	%this.Min = getField(%this.article[%this.articleCount],5);
	}
	%this.recordCount--;
	%this.articleCount++;
	%this.rebuildText();
	canvas.setCursor(DefaultCursor);
	return;
}
//-----------------------------------------------------------------------------
function NewsGui::addStaticArticle( %this, %topic, %body )
{
	%tag = %this.articleCount $= "" ? 0 : %this.articleCount;
	%this.article[%tag] = %topic TAB %body;
	%this.articleCount++;
	%this.rebuildText();
}
//-----------------------------------------------------------------------------
function PostNews()
{
	messageBoxYesNo("CONFIRM","Please do not submit bug reports without a tested solution, test posts or recruiting posts." NL " " NL "Continue with your submittal?","StartPostNews();");
}
function StartPostNews()
{
   $NewsCategory = "";
   $NewsTitle = "";
   Canvas.pushDialog(NewsPostDlg);
   NewsPostDlg.postId = -1;
   NewsPostBodyText.setValue("");
}
//-----------------------------------------------------------------------------
function NewsPostDlg::onWake( %this )
{
   // Get the window pos and extent from prefs:
   %res = getResolution();
   %resW = firstWord( %res );
   %resH = getWord( %res, 1 );
   %w = firstWord( $pref::News::PostWindowExtent );
   if ( %w > %resW )
      %w = %resW;
   %h = getWord( $pref::News::PostWindowExtent, 1 );
   if ( %h > %resH )
      %h = %resH;
   %x = firstWord( $pref::News::PostWindowPos );
   if ( %x > %resW - %w )
      %x = %resW - %w;
   %y = getWord( $pref::News::PostWindowPos, 1 );
   if ( %y > %resH - %h )
      %y = %resH - %h;
   NP_Window.resize( %x, %y, %w, %h );

	if (NewsCategoryMenu.getCount() == 0)
	{
	   NewsCategoryMenu.clear();
	   NewsCategoryMenu.add( NewsTabGroup.getTabText(0), NewsTabGroup.getTabID(0));
	   NewsCategoryMenu.add( NewsTabGroup.getTabText(1), NewsTabGroup.getTabID(1));
	   NewsCategoryMenu.add( NewsTabGroup.getTabText(2), NewsTabGroup.getTabID(2));
	   NewsCategoryMenu.add( NewsTabGroup.getTabText(3), NewsTabGroup.getTabID(3));
	   NewsCategoryMenu.add( NewsTabGroup.getTabText(4), NewsTabGroup.getTabID(4));
	   NewsCategoryMenu.hasTabs = 1;
	}

	%cat = getField(NewsGui.article[NewsPostDlg.selectedIdx],12);
	if (!%cat || %cat == -1 || %cat == 35499)
		%cat = 105;
	error("Category: " @ %cat);
	NewsCategoryMenu.setSelected( %cat );
	$NewsCategory = NewsCategoryMenu.getText();

}
//-----------------------------------------------------------------------------
function NewsCategoryMenu::onAdd(%this)
{
}
//-----------------------------------------------------------------------------
function NewsPostDlg::onSleep( %this )
{
   $pref::News::PostWindowPos = NP_Window.getPosition();
   $pref::News::PostWindowExtent = NP_Window.getExtent();
}
//-----------------------------------------------------------------------------
function NewsCategoryMenu::onSelect( %this, %id, %text )
{
   $NewsCategory = %text;
}
//-----------------------------------------------------------------------------
function PostNewsProcess()
{

	NewsPostDlg.key = LaunchGui.key++;
	if ( NewsPostDlg.postId == -1 )
	{
		NewsPostDlg.state = "post";
 	    canvas.SetCursor(ArrowWaitCursor);
      	DatabaseQuery(1, NewsCategoryMenu.getSelected() TAB $NewsTitle TAB NewsPostBodyText.getValue(),NewsPostDlg,NewsPostDlg.key);
	}
	else
	{
		NewsPostDlg.state = "edit"; //tid.pid.aid.updid.cat.title.body
 	    canvas.SetCursor(ArrowWaitCursor);
		DatabaseQuery(2, NewsPostDlg.EditUrl TAB NewsCategoryMenu.getSelected() TAB $NewsTitle TAB NewsPostBodyText.getValue(),NewsPostDlg,NewsPostDlg.key);
	}
   Canvas.popDialog(NewsPostDlg);
}
//-----------------------------------------------------------------------------
function NewsPostDlg::onDatabaseQueryResult(%this, %status, %RowCount_Result, %key)
{
	if(%key != %this.key)
		return;
	if(getField(%status,0)==0)
	{
		switch$(%this.state)
		{
			case "post":	 			
				if(%this.FromForums)
				{
					%this.FromForums = false;
					ForumsMessageVector.deleteLine( %this.FIndex );
					ForumsTopicsList.refreshFlag = true;
					CacheForumTopic();
					ForumsGoTopics(0);
				}
				%this.state = "OK";
     		 	MessageBoxOK("NOTICE","Your article has been submitted. You may need to refresh your Browser.");

			case "edit":				
				%this.state = "OK";
     		 	MessageBoxOK("NOTICE","Article Updated. You may need to refresh your Browser.");      
			case "delete":	 			
				%this.state = "OK";
				MessageBoxOK("NOTICE","Article Deleted. You may need to refresh your Browser.");
		}
	}
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "error";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
	{
		%this.state = "ERROR";
		MessageBoxOK( "ERROR", getField(%status,1));
	}

	if(%this.state $= "OK")
    	NewsGui.onWake();

	canvas.setCursor(DefaultCursor);
}
//-----------------------------------------------------------------------------
function NewsText::onURL(%this, %url)
{
   NewsPostDlg.selectedIdx = NewsHeadlines.getSelectedID();
   canvas.SetCursor(ArrowWaitCursor);
   switch$(getField(%url,0))
   {
      case "editnews":
         %txt = NewsGui.article[getField(%url,1)];
         $NewsTitle = getField(%txt, 13);
		 %body = getFields(%txt,14);
         %rc = getRecordCount(%body);
         for(%i = 0; %i < %rc; %i++)
            %rtxt = %rtxt @ getRecord(%body, %i) @ "\n";

         NewsPostBodyText.setValue(%rtxt);
         NewsPostDlg.postId = getField(%url,3);
		 NewsPostDlg.EditUrl = getFields(%url,2);  //topicid.postid.authorid.updateid
		 NewsPostDlg.selectedIdx = NewsHeadlines.getSelectedID();
         Canvas.pushDialog( NewsPostDlg );

      case "deletenews":
		 MessageBoxYesNo("CONFIRM","Delete this Article?","NewsPostDlg.doNewsDelete(\"" @ getField(%url,3) TAB getField(%url,2) @ "\");","canvas.setCursor(DefaultCursor);"); // postid.topicid

      case "topiclink":
        %articleId = getField(%url,2);
	    MessageBoxOK("COMMENTS","To Post comments for any news article, go to the Forums, select the News Forum and then select the Topic you want to comment on.  This link will soon be live.");

      default:
         Parent::onURL(%this, %url);
   }
}
//-----------------------------------------------------------------------------
function NewsPostDlg::doNewsDelete(%this,%fields)
{
	%this.key = LaunchGui.key++;
	%this.state = "delete";
	error("News Delete " @ %fields);
	DatabaseQuery(3,%fields, %this, %this.key);
}
//-----------------------------------------------------------------------------
function NewsHeadlines::onSelect( %this, %id, %text )
{
   NewsText.scrollToTag( %id );
}
//-----------------------------------------------------------------------------
function NewsGui::getPreviousNewsItems( %this )
{
   // Fetch the next batch of newer news items:
   if($currentPage == 0)
	return;
   canvas.SetCursor(ArrowWaitCursor);
   NewsGui.key = LaunchGui.key++;
   %this.state = "status";
   %this.articleCount = 0;
   $currentPage--;
   DatabaseQueryArray(0,$currentPage,"1" TAB getField(%this.setList[%this.set],1), NewsGui, NewsGui.key );
}
//-----------------------------------------------------------------------------
function NewsGui::getNextNewsItems( %this )
{
   // Fetch the next batch of older news items:
   canvas.SetCursor(ArrowWaitCursor);
   NewsGui.key = LaunchGui.key++;
   %this.state = "status";
   %this.articleCount = 0;
   $currentPage++;
   DatabaseQueryArray(0,$currentPage,"1" TAB getField(%this.setList[%this.set],0), NewsGui, NewsGui.key );
}
//-----------------------------------------------------------------------------
function NewsMOTDText::onDatabaseQueryResult(%this, %status, %RowCount_Result, %key)
{
	if(%key != %this.key)
    	return;
//	echo("RECV: " @ %status);
	%ai = wonGetAuthInfo();
	%isMem = 0;
	if(getField(%status,0)==0)
	{
		for(%east=0;%east<getField(getRecord(%ai,1),0);%east++)
		{
			%tpv = GetRecord(%ai,2+%east);
			if(getField(%tpv,3)==1401 || getField(%tpv,3)==1402)
				%isMem = 1;
		}
      	NewsEditMOTDBtn.setVisible(%isMem);
   		%this.setText( %RowCount_Result );
	}
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "error";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
	{
    	%this.state = "halt";		
  	     MessageBoxOK("NOTICE",getField(%status,1));
	}
	canvas.repaint();
	Canvas.setCursor(defaultCursor);
}
//-----------------------------------------------------------------------------
function NewsEditMOTD()
{
   NewsEditMOTDText.setText( NewsMOTDText.getText() );
   Canvas.pushDialog( NewsEditMOTDDlg );
}
//-----------------------------------------------------------------------------
function NewsUpdateMOTD()
{
   NewsEditMotdDlg.Key = LaunchGui.key++;
   NewsEditMOtdDlg.state = "verify";
   canvas.SetCursor(ArrowWaitCursor);
   DatabaseQuery( 4, NewsEditMOTDText.getText(), NewsEditMotdDlg,NewsEditMotdDlg.key );
}
//-----------------------------------------------------------------------------
function NewsEditMotdDlg::OnDatabaseQueryResult(%this, %status, %RowCount_Result, %key)
{
	if(%key != %this.key)
    	return;
//	echo("RECV: " @ %status);
	if(getField(%status,0)==0)
		%this.state = "proceed";
	else if (getSubStr(getField(%status,1),0,9) $= "ORA-04061")
	{
		%this.state = "done";
		MessageBoxOK("ERROR","There was an error processing your request, please wait a few moments and try again.");
	}
	else
    	%this.state = "error";		

	switch$(%this.state)
	{
		case "proceed":
			%ai = wonGetAuthInfo();
			%isMem = 0;
			for(%east=0;%east<getField(getRecord(%ai,1),0);%east++)
			{
				%tpv = GetRecord(%ai,2+%east);
				if(getField(%tpv,3)==1401 || getField(%tpv,3)==1402)
					%isMem = 1;
			}
	      	NewsEditMOTDBtn.setVisible(%isMem);			
   			MessageBoxOK("NOTICE",getField(%status,1));
			NewsMOTDText.setText( NewsEditMOTDText.getText() );
			canvas.repaint();
			Canvas.PopDialog(NewsEditMOTDDlg);
		case "error":
   			MessageBoxOK("NOTICE",getField(%status,1));
			Canvas.PopDialog(NewsEditMOTDDlg);
	}
}
//-----------------------------------------------------------------------------
function addWebLink( %name, %address )
{
   $WebLink[$WebLinkCount, name] = %name;
   $WebLink[$WebLinkCount, address] = %address;
   $WebLinkCount++;
}
//-----------------------------------------------------------------------------
function WebLinksMenu::onAdd( %this )
{
}
//-----------------------------------------------------------------------------
function WebLinksMenu::launchWebBrowser( %this )
{
   %address = $WebLink[WebLinksMenu.getSelected(), address];
   error("SELECTED:" SPC WebLinksMenu.getSelected());
   if ( %address !$= "" )
   {
      if ( isFullScreen() )
         MessageBoxYesNo( "WARNING", "This will launch your web browser and minimize Tribes 2."
               @ "  Do you wish to continue?", "gotoWebPage( \"" @ %address @ "\" );" );
      else
         gotoWebPage( %address );
   }
   else
      MessageBoxOK("ERROR","Invalid Link");
}
//-----------------------------------------------------------------------------
//- news stuff ---------------------------------------------------------------
//-----------------------------------------------------------------------------
function NewsTabGroup::onAdd( %this )
{
   // Tab sets should be added in the onAdd function unless you have a really good reason...
   %this.addSet( 1, "gui/shll_horztabbuttonB", "5 5 5", "50 50 0", "5 5 5" );
}

//-----------------------------------------------------------------------------
function NewsTabGroup::onSelect(%this, %id, %text)
{
	if (%this.getSelectedID() == %this.lastID && NewsGui.startup == 0)
		return;
	else
	{	
		NewsTabFrame.setAltColor( %id == 105 );
		NewsGui.startup = 0;
		NewsGui.state = "status";
		NewsGui.key = LaunchGui.key++;
		NewsGui.caller = "GETNEWS";
		// ordinal.page.start.direction.category
		DatabaseQueryArray(100,0,"0" TAB "0" TAB %id,NewsGui,NewsGui.key);
		%this.lastID = %id;
	}

}
//-----------------------------------------------------------------------------
function addCatHeader(%id, %name, %updateID, %allRead, %articleCount, %lastUpdated)
{
   %cHeader = new scriptObject()
   {
      className = "TNewsCategoryHeader";
	  ID = %id;
	  Name = %name;
	  UpdateID = %updateID;
	  allRead = %allRead;
	  articleCount = %articleCount;
	  lastUpdated = %lastUpdated;
   };
   NCHGroup.Add(%cHeader);
}