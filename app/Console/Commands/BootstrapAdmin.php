<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

class BootstrapAdmin extends Command
{
    protected $signature = 'scanner:bootstrap-admin';

    protected $description = 'Create the initial administrator from environment, only when no user exists';

    public function handle(): int
    {
        if (User::exists()) {
            return self::SUCCESS;
        }
        $data = ['email' => env('INITIAL_ADMIN_EMAIL'), 'password' => env('INITIAL_ADMIN_PASSWORD')];
        if (! $data['email'] || ! $data['password']) {
            $this->warn('Belum ada pengguna. Atur INITIAL_ADMIN_EMAIL dan INITIAL_ADMIN_PASSWORD, lalu jalankan scanner:bootstrap-admin.');

            return self::SUCCESS;
        }
        Validator::make($data, ['email' => 'required|email', 'password' => ['required', Password::min(12)->letters()->numbers()]])->validate();
        User::create([...$data, 'name' => 'Administrator', 'role' => 'admin', 'is_active' => true]);
        $this->info('Administrator awal dibuat; ganti password melalui halaman Akun.');

        return self::SUCCESS;
    }
}
