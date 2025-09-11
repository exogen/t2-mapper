$helpTextShown = false;

function toggleHelpText()
{
	// if HUD has been altered, do not show helpTextGui
	if(helpTextGui.visible)
		helpTextGui.setVisible(false);
	else
	{
		if(!$helpTextShown)
		{
			objHudText.setValue("Displays important information about the current mission.");
			chatHudText.setValue("Chat messages from other players are displayed here.");
			energyHudText.setValue("Your armor's available energy. Heat (the red bar) increases as you use jets.");
			compassHudText.setValue("Compass spins as you turn. Clock shows mission time. If the center is flashing red, you've been detected.");
			damageHudText.setValue("You are dead if this reaches zero.");
			reticleHudText.setValue("Your weapon fire hits approximately in the center of this.");
			inventoryHudText.setValue("Shows (left to right) number of grenades, mines, health kits and beacons.");
			weaponsHudText.setValue("Shows your available weapons, plus a targeting laser.");
			$helpTextShown = true;
		}
		helpTextGui.setVisible(true);
	}
}
