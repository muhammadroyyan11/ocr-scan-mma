<?php

namespace Tests\Feature;

use App\Models\ReceivingItem;
use App\Models\ReceivingSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReceivingApiTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role = 'operator'): User
    {
        return User::factory()->create(['role' => $role, 'is_active' => true]);
    }

    private function sessionFor(User $user): ReceivingSession
    {
        return ReceivingSession::create(['session_number' => 'TEST-'.bin2hex(random_bytes(8)), 'created_by' => $user->id, 'status' => 'open']);
    }

    private function payload(array $overrides = []): array
    {
        return array_replace(['lot_number' => '51102D011', 'confirmed' => true, 'verification_status' => 'verified'], $overrides);
    }

    public function test_health_and_login_gate(): void
    {
        $this->getJson('/api/health')->assertOk()->assertJsonPath('data.database', 'connected');
        $this->get('/')->assertRedirect('/login');
        $this->getJson('/api/receiving-sessions')->assertUnauthorized()->assertJsonStructure(['data', 'message', 'errors']);
    }

    public function test_month_precision_round_trips_without_a_fabricated_day(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $response = $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_raw' => '26.08.11', 'mfg_date' => '2026-08-11', 'exp_raw' => '2031.08', 'exp_month' => '2031-08']))
            ->assertCreated()->assertJsonPath('data.exp_month', '2031-08')->assertJsonPath('data.exp_date', null)->assertJsonPath('data.verification_status', 'verified')->assertJsonCount(0, 'warnings');
        $itemId = $response->json('data.id');
        $this->getJson("/api/receiving-items/$itemId")->assertOk()->assertJsonPath('data.exp_month', '2031-08');
        $this->get("/receiving-items/$itemId")->assertOk()->assertSee('2031-08');
        $csv = $this->get("/receiving-sessions/$session->id/export")->assertOk()->streamedContent();
        $this->assertStringContainsString('mfg_month,exp_month', $csv);
        $this->assertStringContainsString('2031-08', $csv);
        $this->assertStringNotContainsString('2031-08-01', $csv);
        $this->putJson("/api/receiving-items/$itemId", $this->payload(['exp_date' => '2031-08-11']))->assertOk()->assertJsonPath('data.exp_month', null);
        $this->putJson("/api/receiving-items/$itemId", $this->payload(['exp_month' => '2031-08']))->assertOk()->assertJsonPath('data.exp_date', null);
    }

    public function test_month_precision_validation_and_date_order(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_month' => '2026-13', 'exp_month' => '2031-00']))->assertUnprocessable()->assertJsonValidationErrors(['mfg_month', 'exp_month']);
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['exp_month' => '2031-08', 'exp_date' => '2031-08-11']))->assertUnprocessable()->assertJsonValidationErrors('exp_month');
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_date' => '2026-09-01', 'exp_month' => '2026-08']))->assertCreated()->assertJsonPath('data.verification_status', 'needs_review')->assertJsonCount(1, 'warnings');
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_date' => '2026-08-11', 'exp_month' => '2026-08']))->assertCreated()->assertJsonPath('data.verification_status', 'verified')->assertJsonCount(0, 'warnings');
    }

    public function test_real_login_logout_and_inactive_login(): void
    {
        $user = $this->user();
        $user->update(['password' => Hash::make('TestPassword1234')]);
        $this->post('/login', ['email' => $user->email, 'password' => 'TestPassword1234'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->post('/logout')->assertRedirect('/login');
        $this->assertGuest();
        $user->update(['is_active' => false]);
        $this->post('/login', ['email' => $user->email, 'password' => 'TestPassword1234'])->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_create_session_uses_authenticated_owner_and_unique_number(): void
    {
        $user = $this->user();
        $this->actingAs($user)->postJson('/api/receiving-sessions', ['supplier_name' => 'Supplier A', 'created_by' => 999, 'status' => 'completed'])->assertCreated()->assertJsonPath('data.created_by', $user->id)->assertJsonPath('data.status', 'open');
        $this->actingAs($user)->postJson('/api/receiving-sessions', [])->assertCreated();
        $this->assertSame(2, $user->receivingSessions()->count());
        $this->assertSame(2, ReceivingSession::distinct()->count('session_number'));
    }

    public function test_session_validation(): void
    {
        $this->actingAs($this->user())->postJson('/api/receiving-sessions', ['store_code' => str_repeat('x', 81), 'notes' => ['bad']])->assertUnprocessable()->assertJsonValidationErrors(['store_code', 'notes']);
    }

    public function test_save_many_items_and_crop_relationships_without_dates(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $response = $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['scans' => [['field_type' => 'LOT', 'raw_text' => 'LOT 51102D011', 'normalized_text' => '51102D011', 'confidence' => 91.5, 'crop_metadata' => ['x' => 50, 'y' => 20, 'width' => 100, 'height' => 30, 'image_width' => 500, 'image_height' => 300, 'preset' => 'original']], ['field_type' => 'OTHER', 'raw_text' => 'Kemasan A', 'confidence' => null]]]))->assertCreated()->assertJsonCount(2, 'data.scans');
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['lot_number' => 'SECOND']))->assertCreated();
        $item = ReceivingItem::findOrFail($response->json('data.id'));
        $this->assertSame($session->id, $item->session->id);
        $this->assertSame(2, $session->items()->count());
        $this->assertSame($item->id, $item->scans()->first()->item->id);
        $this->assertNull($item->mfg_date);
        $this->assertSame('verified', $item->verification_status);
    }

    public function test_confirmation_required_and_empty_ocr_is_not_an_item(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['confirmed' => false]))->assertUnprocessable()->assertJsonValidationErrors('confirmed');
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['lot_number' => '', 'ocr_raw_text' => '']))->assertUnprocessable();
        $this->assertDatabaseCount('receiving_items', 0);
    }

    public function test_lot_number_is_optional_when_missing_null_or_blank(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $payload = ['product_name' => 'Produk tanpa lot', 'confirmed' => true, 'verification_status' => 'verified'];
        $this->actingAs($user);

        foreach ([[], ['lot_number' => null], ['lot_number' => '']] as $lot) {
            $response = $this->postJson("/api/receiving-sessions/$session->id/items", array_replace($payload, $lot))
                ->assertCreated()
                ->assertJsonPath('data.lot_number', null)
                ->assertJsonPath('data.verification_status', 'verified');
            $this->assertDatabaseHas('receiving_items', ['id' => $response->json('data.id'), 'lot_number' => null]);
        }

        $this->assertSame(3, $session->items()->count());
    }

    public function test_dates_can_be_saved_without_a_lot_number(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", [
            'mfg_raw' => '2025-12-25',
            'mfg_date' => '2025-12-25',
            'exp_raw' => '2027-12-30',
            'exp_date' => '2027-12-30',
            'verification_status' => 'verified',
            'confirmed' => true,
        ])->assertCreated()->assertJsonPath('data.lot_number', null)->assertJsonPath('data.mfg_date', '2025-12-25')->assertJsonPath('data.exp_date', '2027-12-30');
    }

    public function test_existing_lot_number_can_be_cleared_when_other_item_data_remains(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $item = $session->items()->create(['product_name' => 'Produk A', 'lot_number' => 'LOT-OLD', 'verification_status' => 'verified']);
        $this->actingAs($user)->putJson("/api/receiving-items/$item->id", $this->payload(['product_name' => 'Produk A', 'lot_number' => '']))
            ->assertOk()->assertJsonPath('data.lot_number', null);
        $this->assertDatabaseHas('receiving_items', ['id' => $item->id, 'product_name' => 'Produk A', 'lot_number' => null]);
    }

    public function test_invalid_dates_confidence_and_status_are_rejected(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_date' => '2025-02-29', 'exp_date' => '30/12/2027', 'ocr_confidence' => 101, 'verification_status' => 'fake']))->assertUnprocessable()->assertJsonValidationErrors(['mfg_date', 'exp_date', 'ocr_confidence', 'verification_status']);
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_date' => '2024-02-29', 'exp_date' => '2027-12-30']))->assertCreated();
    }

    public function test_unknown_date_raw_is_retained_and_marked_for_review(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_raw' => '251218', 'exp_raw' => 'DEC 2027']))->assertCreated()->assertJsonPath('data.mfg_raw', '251218')->assertJsonPath('data.mfg_date', null)->assertJsonPath('data.verification_status', 'needs_review')->assertJsonCount(2, 'warnings');
    }

    public function test_exp_before_mfg_warns_and_never_rewrites_dates(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_date' => '2025-12-25', 'exp_date' => '2024-12-25']))->assertCreated()->assertJsonPath('data.mfg_date', '2025-12-25')->assertJsonPath('data.exp_date', '2024-12-25')->assertJsonPath('data.verification_status', 'needs_review')->assertJsonCount(1, 'warnings');
    }

    public function test_crop_validation_rejects_images_and_out_of_bounds(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['scans' => [['field_type' => 'LOT', 'crop_metadata' => ['base64' => 'bad']]]]))->assertUnprocessable();
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['scans' => [['field_type' => 'LOT', 'crop_metadata' => ['x' => 90, 'y' => 0, 'width' => 20, 'height' => 10, 'image_width' => 100, 'image_height' => 100]]]]))->assertUnprocessable();
        $this->assertDatabaseCount('receiving_items', 0);
    }

    public function test_operator_cannot_access_other_owners_data_or_change_owner(): void
    {
        $owner = $this->user();
        $other = $this->user();
        $session = $this->sessionFor($owner);
        $mine = $this->sessionFor($other);
        $item = $session->items()->create(['lot_number' => 'PRIVATE', 'verification_status' => 'verified']);
        $this->actingAs($other)->getJson('/api/receiving-sessions')->assertOk()->assertJsonCount(1, 'data.data')->assertJsonPath('data.data.0.id', $mine->id);
        $this->getJson("/api/receiving-sessions/$session->id")->assertForbidden();
        $this->getJson("/api/receiving-items/$item->id")->assertForbidden();
        $this->get("/receiving-sessions/$session->id/export")->assertForbidden();
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload())->assertForbidden();
        $this->putJson("/api/receiving-items/$item->id", $this->payload())->assertForbidden();
        $this->deleteJson("/api/receiving-items/$item->id")->assertForbidden();
        $this->putJson("/api/receiving-items/$item->id", $this->payload(['receiving_session_id' => $mine->id]))->assertForbidden();
    }

    public function test_viewer_is_read_only_but_can_export(): void
    {
        $session = $this->sessionFor($this->user());
        $item = $session->items()->create(['lot_number' => 'READ', 'verification_status' => 'verified']);
        $this->actingAs($this->user('viewer'))->getJson("/api/receiving-items/$item->id")->assertOk();
        $this->get("/receiving-sessions/$session->id/export")->assertOk();
        $this->postJson('/api/receiving-sessions', [])->assertForbidden();
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload())->assertForbidden();
        $this->putJson("/api/receiving-items/$item->id", $this->payload())->assertForbidden();
        $this->deleteJson("/api/receiving-items/$item->id")->assertForbidden();
        $this->get('/users')->assertForbidden();
    }

    public function test_supervisor_can_close_reopen_and_edit_others_sessions(): void
    {
        $session = $this->sessionFor($this->user());
        $this->actingAs($this->user('supervisor'))->postJson("/api/receiving-sessions/$session->id/items", $this->payload())->assertCreated();
        $this->patchJson("/api/receiving-sessions/$session->id/status", ['status' => 'completed'])->assertOk();
        $this->postJson("/api/receiving-sessions/$session->id/items", $this->payload())->assertForbidden();
        $this->patchJson("/api/receiving-sessions/$session->id/status", ['status' => 'open'])->assertOk();
        $this->postJson('/api/users', [])->assertForbidden();
    }

    public function test_operator_cannot_close_a_session(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->patchJson("/api/receiving-sessions/$session->id/status", ['status' => 'completed'])->assertForbidden();
    }

    public function test_update_preserves_scans_unless_explicitly_replaced_and_delete_cascades(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $item = $session->items()->create(['lot_number' => 'ORIGINAL', 'verification_status' => 'verified']);
        $item->scans()->create(['field_type' => 'LOT', 'raw_text' => 'ORIGINAL']);
        $this->actingAs($user)->putJson("/api/receiving-items/$item->id", $this->payload(['lot_number' => 'EDIT']))->assertOk()->assertJsonCount(1, 'data.scans');
        $this->assertDatabaseHas('receiving_items', ['id' => $item->id, 'lot_number' => 'EDIT']);
        $this->deleteJson("/api/receiving-items/$item->id")->assertOk();
        $this->assertDatabaseCount('receiving_item_scans', 0);
    }

    public function test_admin_user_management_and_protect_own_account(): void
    {
        $admin = $this->user('admin');
        $response = $this->actingAs($admin)->postJson('/api/users', ['name' => 'Staff', 'email' => 'staff@example.test', 'password' => 'StaffPassword1234', 'role' => 'operator', 'is_active' => true])->assertCreated()->assertJsonMissingPath('data.password');
        $staff = User::findOrFail($response->json('data.id'));
        $this->assertTrue(Hash::check('StaffPassword1234', $staff->password));
        $this->putJson("/api/users/$staff->id", ['name' => 'Staff', 'email' => $staff->email, 'role' => 'viewer', 'is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);
        $this->putJson("/api/users/$admin->id", ['name' => $admin->name, 'email' => $admin->email, 'role' => 'operator', 'is_active' => true])->assertUnprocessable();
        $this->postJson('/api/users', ['name' => 'Bad', 'email' => 'bad@example.test', 'password' => 'short', 'role' => 'root', 'is_active' => true])->assertUnprocessable();
    }

    public function test_inactive_existing_session_loses_access(): void
    {
        $user = $this->user();
        $this->actingAs($user);
        $user->update(['is_active' => false]);
        $this->getJson('/api/receiving-sessions')->assertForbidden();
        $this->assertGuest();
    }

    public function test_web_pages_render_without_errors_and_escape_labels(): void
    {
        $user = $this->user('admin');
        $session = $this->sessionFor($user);
        $item = $session->items()->create(['product_name' => '<script>alert(1)</script>', 'verification_status' => 'needs_review']);
        $this->actingAs($user);
        foreach (['/', '/receiving-sessions', '/receiving-sessions/new', "/receiving-sessions/$session->id", "/receiving-sessions/$session->id/scanner", "/receiving-items/$item->id", '/users', '/account'] as $url) {
            $this->get($url)->assertOk();
        }
        $this->get("/receiving-items/$item->id")->assertSee('&lt;script&gt;alert(1)&lt;/script&gt;', false)->assertDontSee('<script>alert(1)</script>', false);
    }

    public function test_csv_neutralizes_spreadsheet_formulas(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $session->items()->create(['product_name' => '=HYPERLINK("bad")', 'lot_number' => '@SUM(1)', 'verification_status' => 'verified']);
        $content = $this->actingAs($user)->get("/receiving-sessions/$session->id/export")->assertOk()->streamedContent();
        $this->assertStringContainsString("'=HYPERLINK", $content);
        $this->assertStringContainsString("'@SUM", $content);
    }

    public function test_api_mutations_require_csrf_in_real_environment(): void
    {
        $this->app->instance('env', 'local');
        $this->actingAs($this->user())->postJson('/api/receiving-sessions', [])->assertStatus(419);
    }

    public function test_password_change_validates_current_password(): void
    {
        $user = $this->user();
        $user->update(['password' => Hash::make('OldPassword1234')]);
        $this->actingAs($user)->put('/account/password', ['current_password' => 'wrong', 'password' => 'NewPassword1234', 'password_confirmation' => 'NewPassword1234'])->assertSessionHasErrors('current_password');
        $this->put('/account/password', ['current_password' => 'OldPassword1234', 'password' => 'NewPassword1234', 'password_confirmation' => 'NewPassword1234'])->assertSessionHasNoErrors();
        $this->assertTrue(Hash::check('NewPassword1234', $user->fresh()->password));
    }

    public function test_partial_update_cannot_bypass_unknown_date_review(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $item = $session->items()->create(['lot_number' => 'TEST', 'mfg_raw' => '251218', 'verification_status' => 'needs_review']);
        $this->actingAs($user)->putJson("/api/receiving-items/$item->id", $this->payload())->assertOk()->assertJsonPath('data.verification_status', 'needs_review')->assertJsonPath('data.mfg_raw', '251218');
    }

    public function test_invalid_crop_payload_rolls_back_whole_item(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['scans' => [['field_type' => 'LOT', 'raw_text' => 'ok'], ['field_type' => 'INVALID']]]))->assertUnprocessable();
        $this->assertDatabaseCount('receiving_items', 0);
        $this->assertDatabaseCount('receiving_item_scans', 0);
    }

    public function test_dates_outside_supported_database_range_are_rejected(): void
    {
        $user = $this->user();
        $session = $this->sessionFor($user);
        $this->actingAs($user)->postJson("/api/receiving-sessions/$session->id/items", $this->payload(['mfg_date' => '0999-12-31']))->assertUnprocessable()->assertJsonValidationErrors('mfg_date');
    }
}
