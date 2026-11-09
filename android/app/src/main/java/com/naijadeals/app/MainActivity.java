package com.naijadeals.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before the bridge starts so window.NaijaDealsLocation exists
        // by the time the web layer calls it.
        registerPlugin(NaijaDealsLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
