$cmdMapHelpTextShown = false;

function toggleCmdMapHelpText()
{
	if(CmdMapHelpTextGui.visible)
		CmdMapHelpTextGui.setVisible(false);
	else {
		if(!$cmdMapHelpTextShown) {
			teamButtonText.setValue("Left click to select, right click to give commands.");
			tacticalButtonText.setValue("Turrets and friendly vehicles. Click the square after a turret's name to control it.");
			supportButtonText.setValue("Your team's stations, generators, cameras, and sensors.");
			waypointButtonText.setValue("All waypoints.");
			objectiveButtonText.setValue("All flags and switches.");
			handToolText.setValue("Toggles between hand (for moving the map) and pointer (for selecting objects and dragging selection).");
			zoomToolText.setValue("When this tool is on, left click to zoom in and right click to zoom out.");
			centerToolText.setValue("Centers your view on selected object. If nothing is selected, centers the view on mission area.");
			textToolText.setValue("Toggles map text labels on and off.");
			cameraToolText.setValue("Gives you a small camera view of the area around selected object. Waypoints and enemy objects can not be viewed.");
			sensorToolText.setValue("Toggles all sensor spheres on/off so you can check your team's sensor coverage.");
			generalHelpText.setValue("Right click any object to display commands. Click on the command or type the highlighted letter to issue it to your team. To command an individual, click on the player's name, then issue the command.");
			$cmdMapHelpTextShown = true;
		}
		CmdMapHelpTextGui.setVisible(true);
	}
}
