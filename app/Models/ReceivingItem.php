<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReceivingItem extends Model
{
    protected $fillable = ['product_name', 'product_reference', 'barcode', 'lot_number', 'mfg_raw', 'mfg_date', 'mfg_month', 'exp_raw', 'exp_date', 'exp_month', 'ocr_raw_text', 'ocr_confidence', 'verification_status', 'notes'];

    protected $casts = ['mfg_date' => 'date:Y-m-d', 'exp_date' => 'date:Y-m-d', 'ocr_confidence' => 'float'];

    public function session(): BelongsTo
    {
        return $this->belongsTo(ReceivingSession::class, 'receiving_session_id');
    }

    public function scans(): HasMany
    {
        return $this->hasMany(ReceivingItemScan::class);
    }
}
