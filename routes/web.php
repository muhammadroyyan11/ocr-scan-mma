<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\PageController;
use App\Http\Controllers\SessionController;
use App\Http\Controllers\UserController;
use App\Http\Middleware\ActiveUser;
use App\Http\Middleware\RequireAdmin;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    Route::view('/login', 'auth.login')->name('login');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
});

Route::middleware(['auth', 'auth.session', ActiveUser::class])->group(function () {
    Route::get('/', [PageController::class, 'dashboard'])->name('dashboard');
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::view('/account', 'auth.account');
    Route::put('/account/password', [AuthController::class, 'password'])->middleware('throttle:10,1');
    Route::get('/receiving-sessions', [SessionController::class, 'index']);
    Route::view('/receiving-sessions/new', 'sessions.create')->middleware('can:create,App\Models\ReceivingSession');
    Route::get('/receiving-sessions/{session}', [SessionController::class, 'show']);
    Route::get('/receiving-sessions/{session}/scanner', [PageController::class, 'scanner']);
    Route::get('/receiving-sessions/{session}/export', [SessionController::class, 'export'])->middleware('throttle:20,1');
    Route::get('/receiving-items/{item}', [ItemController::class, 'show']);
    Route::get('/users', [UserController::class, 'index'])->middleware(RequireAdmin::class);

    Route::prefix('api')->middleware('throttle:api')->group(function () {
        Route::get('/receiving-sessions', [SessionController::class, 'index']);
        Route::post('/receiving-sessions', [SessionController::class, 'store']);
        Route::get('/receiving-sessions/{session}', [SessionController::class, 'show']);
        Route::patch('/receiving-sessions/{session}/status', [SessionController::class, 'status']);
        Route::post('/receiving-sessions/{session}/items', [ItemController::class, 'store']);
        Route::get('/receiving-items/{item}', [ItemController::class, 'show']);
        Route::put('/receiving-items/{item}', [ItemController::class, 'update']);
        Route::delete('/receiving-items/{item}', [ItemController::class, 'destroy']);
        Route::middleware(RequireAdmin::class)->group(function () {
            Route::post('/users', [UserController::class, 'store']);
            Route::put('/users/{user}', [UserController::class, 'update']);
        });
    });
});
