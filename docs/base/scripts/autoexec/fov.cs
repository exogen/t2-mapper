// #autoload
// #name = Spawn Bug Fix
// #version = 1.0
// #date = June 28, 2001
// #status = final
// #author = Daniel Trevino
// #warrior = liq
// #email = liqy@swbell.net
// #web = http://www.toejamsplace.com/
// #description = Fixes a bug in T2 where your FOV is set back to 90 on respawn. You can now use whatever FOV you want by editing your "$pref::Player::defaultFov" in ClientPrefs.cs

package spawnFix {
   function ClientCmdDisplayHuds() {
      parent::ClientCmdDisplayHuds();
      schedule(150, 0, setFov, $pref::Player::defaultFov);
      schedule(1000, 0, setFov, $pref::Player::defaultFov);
   }
   function clientCmdSetInventoryHudItem(%slot, %amount, %addItem)
   {
      parent::clientCmdSetInventoryHudItem(%slot, %amount, %addItem);
      schedule(150, 0, use, disc);
      schedule(1000, 0, use, disc);
   }
};
activatePackage(spawnFix); 