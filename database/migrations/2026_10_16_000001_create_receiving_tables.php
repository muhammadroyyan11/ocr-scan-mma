<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 20)->default('operator')->index();
            $table->boolean('is_active')->default(true);
        });
        Schema::create('receiving_sessions', function (Blueprint $table) {
            $table->id();
            $table->string('session_number', 60)->unique();
            $table->string('reference_number')->nullable()->index();
            $table->string('supplier_name')->nullable();
            $table->string('store_code', 80)->nullable()->index();
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('open')->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['created_by', 'created_at']);
        });
        Schema::create('receiving_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receiving_session_id')->constrained()->cascadeOnDelete();
            $table->string('product_name')->nullable();
            $table->string('product_reference')->nullable();
            $table->string('barcode')->nullable()->index();
            $table->string('lot_number')->nullable()->index();
            $table->string('mfg_raw')->nullable();
            $table->date('mfg_date')->nullable();
            $table->string('exp_raw')->nullable();
            $table->date('exp_date')->nullable()->index();
            $table->text('ocr_raw_text')->nullable();
            $table->decimal('ocr_confidence', 5, 2)->nullable();
            $table->string('verification_status', 20)->default('needs_review')->index();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
        Schema::create('receiving_item_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('receiving_item_id')->constrained()->cascadeOnDelete();
            $table->string('field_type', 10);
            $table->text('raw_text')->nullable();
            $table->text('normalized_text')->nullable();
            $table->decimal('confidence', 5, 2)->nullable();
            $table->json('crop_metadata')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receiving_item_scans');
        Schema::dropIfExists('receiving_items');
        Schema::dropIfExists('receiving_sessions');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn(['role', 'is_active']));
    }
};
