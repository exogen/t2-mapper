//--------------------------------------------------------------------------
//
// PantherXL.cs
//
// These are the default control bindings for the Mad Catz Panther XL Pro
//
//--------------------------------------------------------------------------

moveMap.bind( joystick, xaxis, D, "-0.1 0.1", joystickMoveX );
moveMap.bind( joystick, yaxis, D, "-0.1 0.1", joystickMoveY );
moveMap.bind( joystick, rxaxis, I, joystickPitch );
moveMap.bind( joystick, ryaxis, joystickYaw );

moveMap.bind( joystick, button0, mouseFire );
moveMap.bind( joystick, button1, mouseJet );
moveMap.bindCmd( joystick, button2, "setFov(30);", "setFov($pref::player::defaultFOV);" );
moveMap.bind( joystick, button3, jump );

moveMap.bindCmd( joystick, upov, "use(Plasma);", "" );
moveMap.bindCmd( joystick, rpov, "use(Chaingun);", "" );
moveMap.bindCmd( joystick, dpov, "use(Disc);", "" );
moveMap.bindCmd( joystick, lpov, "use(GrenadeLauncher);", "" );

moveMap.bindCmd( joystick, button4, "use(SniperRifle);", "" );   // Second POV buttons...
moveMap.bindCmd( joystick, button5, "use(ELFGun);", "" );
moveMap.bindCmd( joystick, button6, "use(Mortar);", "" );
moveMap.bindCmd( joystick, button7, "use(MissileLauncher);", "" );

moveMap.bindCmd( joystick, button8, "use(RepairKit);", "" );
moveMap.bind( joystick, button9, toggleFirstPerson );
moveMap.bindCmd( joystick, button10, "prevWeapon();", "" );
moveMap.bindCmd( joystick, button11, "use(Backpack);", "" );
moveMap.bindCmd( joystick, button12, "nextWeapon();", "" );
