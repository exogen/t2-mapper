function LaunchCredits()
{
   Canvas.setContent(CreditsGui);
}

function cancelCredits()
{
   //delete the action map
   CreditsActionMap.pop();

   //kill the schedules
   cancel($CreditsScrollSchedule);
   cancel($CreditsSlideShow);

   //kill the music
   MusicPlayer.stop();

   //load the launch gui back...
   Canvas.setContent(LaunchGui);

   //delete the contents of the ML ctrl so as to free up memory...
   Credits_Text.setText("");
}

function CreditsGui::onWake(%this)
{
   //create an action map to use "esc" to exit the credits screen...
   if (!isObject(CreditsActionMap))
   {
      new ActionMap(CreditsActionMap);
      CreditsActionMap.bindCmd(keyboard, anykey, "cancelCredits();", "");
      CreditsActionMap.bindCmd(keyboard, space, "cancelCredits();", "");
      CreditsActionMap.bindCmd(keyboard, escape, "cancelCredits();", "");
      CreditsActionMap.bindCmd(mouse, button0, "$CreditsPaused = true;", "$CreditsPaused = false;");
      CreditsActionMap.bindCmd(mouse, button1, "$CreditsSpeedUp = true;", "$CreditsSpeedUp = false;");
      if (!isDemo())
         CreditsActionMap.bindCmd(mouse, button2, "creditsNextPic();", "");
   }
   CreditsActionMap.push();

   //build the ML text ctrl...
   exec("scripts/creditsText.cs");
   if (!isDemo())
   {
      $CreditsPicIndex = 1;
      CREDITS_Pic.setBitmap("gui/Cred_" @ $CreditsPicIndex @ ".png");
   }
   else
      CREDITS_Pic.setBitmap("gui/Cred_1.bm8");

   //music array
   if (!isDemo())
   {
      $CreditsMusic[0] = "badlands";
      $CreditsMusic[1] = "desert";
      $CreditsMusic[2] = "ice";
      $CreditsMusic[3] = "lush";
      $CreditsMusic[4] = "volcanic";
   }
   else
   {
      $CreditsMusic[0] = "lush";
      $CreditsMusic[1] = "desert";
      $CreditsMusic[2] = "desert";
      $CreditsMusic[3] = "lush";
      $CreditsMusic[4] = "desert";
   }

   //start the credits from the beginning
   $CreditsOffset = 0.0;
   %screenHeight = getWord(getResolution(), 1);
   Credits_Text.resize(getWord(Credits_Text.position, 0),
                        mFloor(%screenHeight / 2) - 125,
                        getWord(Credits_Text.extent, 0),
                        getWord(Credits_Text.extent, 1));

   //start the scrolling
   $CreditsPaused = false;
   $CreditsSpeedUp = false;
   $CreditsScrollSchedule = schedule(3000, 0, scrollTheCredits);

   //start cycling the bitmaps
   if (!isDemo())
      $CreditsSlideShow = schedule(5000, 0, creditsNextPic);

   //start some music
   %chooseTrack = mFloor(getRandom() * 4.99);
   MusicPlayer.playTrack($CreditsMusic[%chooseTrack]);
}

function addCreditsLine(%text, %lastLine)
{
   CREDITS_Text.addText(%text @ "\n", %lastline);
}

function scrollTheCredits()
{
   //make sure we're not paused
   if (!$CreditsPaused)
   {
      //if we've scrolled off the top, set the position back down to the bottom
      %parentCtrl = CREDITS_Text.getGroup();
      if (getWord(Credits_Text.position, 1) + getWord(Credits_Text.extent, 1) < 0)
      {
         Credits_Text.position = getWord(Credits_Text.position, 0) SPC getWord(%parentCtrl.extent, 1);
         $CreditsOffset = getWord(Credits_Text.position, 1);
      }

      if ($CreditsSpeedUp)
         %valueToScroll = 10;
      else
         %valueToScroll = 1;

      //scroll the control up a bit
      Credits_Text.resize(getWord(Credits_Text.position, 0),
                           getWord(Credits_Text.position, 1) - %valueToScroll,
                           getWord(Credits_Text.extent, 0),
                           getWord(Credits_Text.extent, 1));
   }

   //schedule the next scroll...
   $CreditsScrollSchedule = schedule(10, 0, scrollTheCredits);
}

function creditsNextPic()
{
   //no slide show in the demo...
   if (isDemo())
      return;

   cancel($CreditsSlideShow);
   if (!$CreditsPaused)
   {
      $CreditsPicIndex += 1;
      if ($CreditsPicIndex > 46)
         $CreditsPicindex = 1;

      //set the bitmap
      CREDITS_Pic.setBitmap("gui/Cred_" @ $CreditsPicIndex @ ".png");
   }

   //schedule the next bitmap
   $CreditsSlideShow = schedule(5000, 0, creditsNextPic);
}