// simple gui to allow for custom options server side 

function loadVehDlg(){
   new GuiControl(PickVehDlg) {
      profile = "GuiDefaultProfile";
      horizSizing = "width";
      vertSizing = "height";
      position = "0 0";
      extent = "640 480";
      minExtent = "8 8";
      visible = "1";
      helpTag = "0";
         mouseOn = "1";

      new ShellPaneCtrl(PickVehFrame) {
         profile = "ShellDlgPaneProfile";
         horizSizing = "center";
         vertSizing = "center";
         position = "220 115";
         extent = "250 250";
         minExtent = "48 92";
         visible = "1";
         helpTag = "0";
         noTitleBar = "0";
         new ShellBitmapButton(PickVehAButton) {
            profile = "ShellButtonProfile";
            horizSizing = "center";
            vertSizing = "top";
            position = "158 25";
            extent = "120 60";
            minExtent = "8 8";
            visible = "0";
            helpTag = "0";
            text = "";
            command = "commandToServer('ClientPickVeh', PickVehDlg.calName, 1);";
         };
      
         new ShellBitmapButton(PickVehBButton) {
            profile = "ShellButtonProfile";
            horizSizing = "center";
            vertSizing = "top";
            position = "158 60";
            extent = "120 60";
            minExtent = "8 8";
            visible = "0";
            helpTag = "0";
            text = "";
            command = "commandToServer('ClientPickVeh', PickVehDlg.calName, 2);";
         };
         new ShellBitmapButton(PickVehCButton) {
            profile = "ShellButtonProfile";
            horizSizing = "center";
            vertSizing = "top";
            position = "158 95";
            extent = "120 60";
            minExtent = "8 8";
            visible = "0";
            helpTag = "0";
            text = "";
            command = "commandToServer('ClientPickVeh', PickVehDlg.calName, 3);";
         };
         new ShellBitmapButton(PickVehDButton) {
            profile = "ShellButtonProfile";
            horizSizing = "center";
            vertSizing = "top";
            position = "158 130";
            extent = "120 60";
            minExtent = "8 8";
            visible = "0";
            helpTag = "0";
            text = "";
            command = "commandToServer('ClientPickVeh', PickVehDlg.calName, 4);";
         };
         new ShellBitmapButton(PickVehEButton) {
            profile = "ShellButtonProfile";
            horizSizing = "center";
            vertSizing = "top";
            position = "158 165";
            extent = "120 60";
            minExtent = "8 8";
            visible = "0";
            helpTag = "0";
            text = "";
            command = "commandToServer('ClientPickVeh', PickVehDlg.calName, 5);";
         };
         new ShellBitmapButton(PickVehFButton) {
            profile = "ShellButtonProfile";
            horizSizing = "center";
            vertSizing = "top";
            position = "158 200";
            extent = "120 60";
            minExtent = "8 8";
            visible = "0";
            helpTag = "0";
            text = "";
            command = "commandToServer('ClientPickVeh', PickVehDlg.calName, 6);";
         };
      };
   };
}

function clientCmdPickVehMenu(%val, %callName, %name, %btnA, %btnB, %btnC, %btnD, %btnE, %btnF){
   if(!isObject(PickVehDlg)){
      loadVehDlg();
   }
   if(%val){
      PickVehDlg.calName = %callName;
      ClientCmdSetHudMode("PickVeh");
      PickVehFrame.setTitle(%name);

      PickVehAButton.setVisible(%btnA !$= "");
      PickVehAButton.setValue(%btnA);

      PickVehBButton.setVisible(%btnB !$= "");
      PickVehBButton.setValue(%btnB);

      PickVehCButton.setVisible(%btnC !$= "");
      PickVehCButton.setValue(%btnC);

      PickVehDButton.setVisible(%btnD !$= "");
      PickVehDButton.setValue(%btnD);

      PickVehEButton.setVisible(%btnE!$= "");
      PickVehEButton.setValue(%btnE);

      PickVehFButton.setVisible(%btnF !$= "");
      PickVehFButton.setValue(%btnF);

      Canvas.pushDialog( PickVehDlg );
   }
   else{
      Canvas.popDialog(PickVehDlg);
   }
}

function clientCmdOpenCommanderMap(%scope){
   if(isPlayingDemo())
      return;

   if(%scope)
   {
      CommanderMap.openAllCategories();
      CommanderMapGui.open();
   }
   else
      CommanderMapGui.close();
}

