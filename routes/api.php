<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    try {
        DB::select('SELECT 1');

        return response()->json(['data' => ['status' => 'ok', 'database' => 'connected'], 'message' => 'Stock Arrival Scanner siap.']);
    } catch (Throwable $exception) {
        return response()->json(['data' => ['status' => 'unavailable'], 'message' => 'Database belum siap.'], 503);
    }
});
