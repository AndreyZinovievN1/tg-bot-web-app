import { useRef, useState } from 'react';
import { FiAlignCenter, FiAlignLeft, FiAlignRight, FiArrowDown, FiArrowUp, FiPlus, FiTrash2, FiUpload, FiX } from 'react-icons/fi';
import {
  docsAccentTones,
  docsAlignOptions,
  docsCalloutTones,
  docsDividerStyles,
  docsHeadingLevels,
  docsImageSizes,
  docsLimits,
  docsListStyles,
  docsTextSizes,
} from '../../config/docs.js';
import { useTranslation } from '../../i18n/I18nContext.js';
import { imageFileToDataUrl, moveInArray } from '../../utils/docs.js';
import RichTextField from './RichTextField.jsx';

/**
 * Поля конкретного блока статьи: текст, список, изображение, таблица и т. д.
 * Каждый тип редактируется своими элементами управления — без «просто textarea».
 */
function DocsBlockFields({ block, onChange }) {
  const { t } = useTranslation();
  const fileRef = useRef(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');

  const patch = changes => onChange({ ...block, ...changes });

  if (block.type === 'heading') {
    return (
      <>
        <Row label={t('docs.admin.fieldLevel')}>
          <Segmented
            options={docsHeadingLevels.map(item => ({ id: item.level, label: item.label }))}
            value={block.level}
            onChange={level => patch({ level })}
          />
        </Row>
        <Row label={t('docs.admin.fieldAlign')}>
          <AlignPicker t={t} value={block.align} onChange={align => patch({ align })} />
        </Row>
        <RichTextField
          rows={2}
          value={block.text}
          placeholder={t('docs.admin.placeholderHeading')}
          onChange={text => patch({ text })}
        />
      </>
    );
  }

  if (block.type === 'text') {
    return (
      <>
        <Row label={t('docs.admin.fieldSize')}>
          <Segmented
            options={docsTextSizes.map(item => ({ id: item.id, label: t(item.labelKey) }))}
            value={block.size}
            onChange={size => patch({ size })}
          />
          <AlignPicker t={t} value={block.align} onChange={align => patch({ align })} />
        </Row>
        <RichTextField
          rows={5}
          value={block.text}
          placeholder={t('docs.admin.placeholderText')}
          onChange={text => patch({ text })}
        />
      </>
    );
  }

  if (block.type === 'list') {
    const items = Array.isArray(block.items) ? block.items : [];

    return (
      <>
        <Row label={t('docs.admin.fieldStyle')}>
          <Segmented
            options={docsListStyles.map(item => ({ id: item.id, label: `${item.icon} ${t(item.labelKey)}` }))}
            value={block.style}
            onChange={style => patch({ style })}
          />
        </Row>

        <div className="docs-items">
          {items.map((item, index) => (
            <div className="docs-items__row" key={`item-${index}`}>
              <span className="docs-items__marker" aria-hidden="true">{index + 1}</span>
              <RichTextField
                compact
                rows={1}
                value={item}
                placeholder={t('docs.admin.itemPlaceholder')}
                onChange={value => patch({ items: items.map((current, position) => (position === index ? value : current)) })}
              />
              <div className="docs-items__tools">
                <IconButton label={t('docs.admin.moveItemUp')} disabled={index === 0} onClick={() => patch({ items: moveInArray(items, index, -1) })} icon={<FiArrowUp />} />
                <IconButton label={t('docs.admin.moveItemDown')} disabled={index === items.length - 1} onClick={() => patch({ items: moveInArray(items, index, 1) })} icon={<FiArrowDown />} />
                <IconButton label={t('docs.admin.removeItem')} disabled={items.length <= 1} onClick={() => patch({ items: items.filter((_, position) => position !== index) })} icon={<FiTrash2 />} danger />
              </div>
            </div>
          ))}

          {items.length < docsLimits.listItems && (
            <button className="docs-items__add" type="button" onClick={() => patch({ items: [...items, ''] })}>
              <FiPlus /> {t('docs.admin.addItem')}
            </button>
          )}
        </div>
      </>
    );
  }

  if (block.type === 'image') {
    const pickFile = async event => {
      const file = event.target.files?.[0];

      event.target.value = '';

      if (!file) {
        return;
      }

      setImageBusy(true);
      setImageError('');

      try {
        patch({ src: await imageFileToDataUrl(file) });
      } catch (error) {
        setImageError(t(String(error.message || '').startsWith('docs.') ? error.message : 'docs.errors.imageRead'));
      } finally {
        setImageBusy(false);
      }
    };

    return (
      <>
        <div className="docs-image">
          <div className="docs-image__preview" data-empty={block.src ? 'false' : 'true'}>
            {block.src
              ? <img alt={block.alt || ''} src={block.src} />
              : <span>{t('docs.admin.imageEmpty')}</span>}
          </div>

          <div className="docs-image__tools">
            <input accept="image/*" hidden ref={fileRef} type="file" onChange={pickFile} />
            <button className="btn btn-ghost btn-small" disabled={imageBusy} type="button" onClick={() => fileRef.current?.click()}>
              <FiUpload /> {imageBusy ? t('docs.admin.imageLoading') : t('docs.admin.uploadImage')}
            </button>
            {block.src ? (
              <button className="btn btn-ghost btn-small" type="button" onClick={() => patch({ src: '' })}>
                <FiX /> {t('docs.admin.imageClear')}
              </button>
            ) : null}
          </div>
        </div>

        {imageError ? <div className="inline-alert">{imageError}</div> : null}

        <Row label={t('docs.admin.fieldSrc')}>
          <input
            className="docs-input"
            placeholder="https://…"
            value={String(block.src || '').startsWith('data:') ? '' : block.src || ''}
            onChange={event => patch({ src: event.target.value })}
          />
        </Row>

        <Row label={t('docs.admin.fieldSize')}>
          <Segmented
            options={docsImageSizes.map(item => ({ id: item.id, label: t(item.labelKey) }))}
            value={block.size}
            onChange={size => patch({ size })}
          />
          <AlignPicker t={t} value={block.align} onChange={align => patch({ align })} />
        </Row>

        <Row label={t('docs.admin.fieldCaption')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderCaption')}
            value={block.caption || ''}
            onChange={event => patch({ caption: event.target.value })}
          />
        </Row>

        <Row label={t('docs.admin.fieldAlt')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderAlt')}
            value={block.alt || ''}
            onChange={event => patch({ alt: event.target.value })}
          />
          <label className="docs-check">
            <input checked={Boolean(block.rounded)} type="checkbox" onChange={event => patch({ rounded: event.target.checked })} />
            {t('docs.admin.fieldRounded')}
          </label>
        </Row>
      </>
    );
  }

  if (block.type === 'quote') {
    return (
      <>
        <RichTextField rows={3} value={block.text} placeholder={t('docs.admin.placeholderQuote')} onChange={text => patch({ text })} />
        <Row label={t('docs.admin.fieldAuthor')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderAuthor')}
            value={block.author || ''}
            onChange={event => patch({ author: event.target.value })}
          />
        </Row>
      </>
    );
  }

  if (block.type === 'callout') {
    return (
      <>
        <Row label={t('docs.admin.fieldTone')}>
          <Segmented
            options={docsCalloutTones.map(item => ({ id: item.id, label: `${item.icon} ${t(item.labelKey)}` }))}
            value={block.tone}
            onChange={tone => patch({ tone })}
          />
        </Row>
        <Row label={t('docs.admin.fieldCalloutTitle')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderCalloutTitle')}
            value={block.title || ''}
            onChange={event => patch({ title: event.target.value })}
          />
        </Row>
        <RichTextField rows={3} value={block.text} placeholder={t('docs.admin.placeholderText')} onChange={text => patch({ text })} />
      </>
    );
  }

  if (block.type === 'badges') {
    const items = Array.isArray(block.items) ? block.items : [];
    const patchBadge = (index, changes) => patch({
      items: items.map((current, position) => (position === index ? { ...current, ...changes } : current)),
    });

    return (
      <div className="docs-items">
        {items.map((item, index) => (
          <div className="docs-items__row docs-items__row--badge" key={`badge-${index}`}>
            <span className="docs-items__marker" aria-hidden="true">🏷</span>
            <input
              className="docs-input"
              placeholder={t('docs.admin.badgePlaceholder')}
              value={item.text || ''}
              onChange={event => patchBadge(index, { text: event.target.value })}
            />
            <Segmented
              options={docsAccentTones.map(option => ({ id: option.id, label: option.icon }))}
              value={item.tone || 'accent'}
              onChange={tone => patchBadge(index, { tone })}
            />
            <ItemTools
              index={index}
              t={t}
              total={items.length}
              onMove={offset => patch({ items: moveInArray(items, index, offset) })}
              onRemove={() => patch({ items: items.filter((_, position) => position !== index) })}
            />
          </div>
        ))}

        {items.length < docsLimits.listItems && (
          <AddItemButton t={t} onClick={() => patch({ items: [...items, { text: '', tone: 'accent' }] })} />
        )}
      </div>
    );
  }

  if (block.type === 'steps') {
    const items = Array.isArray(block.items) ? block.items : [];
    const patchStep = (index, changes) => patch({
      items: items.map((current, position) => (position === index ? { ...current, ...changes } : current)),
    });

    return (
      <div className="docs-items">
        {items.map((item, index) => (
          <div className="docs-items__row docs-items__row--stack" key={`step-${index}`}>
            <span className="docs-items__marker" aria-hidden="true">{index + 1}</span>
            <div className="docs-items__stack">
              <input
                className="docs-input"
                placeholder={t('docs.admin.stepTitlePlaceholder')}
                value={item.title || ''}
                onChange={event => patchStep(index, { title: event.target.value })}
              />
              <RichTextField
                compact
                rows={2}
                value={item.text}
                placeholder={t('docs.admin.stepTextPlaceholder')}
                onChange={text => patchStep(index, { text })}
              />
            </div>
            <ItemTools
              index={index}
              t={t}
              total={items.length}
              onMove={offset => patch({ items: moveInArray(items, index, offset) })}
              onRemove={() => patch({ items: items.filter((_, position) => position !== index) })}
            />
          </div>
        ))}

        {items.length < docsLimits.listItems && (
          <AddItemButton t={t} onClick={() => patch({ items: [...items, { title: '', text: '' }] })} />
        )}
      </div>
    );
  }

  if (block.type === 'stats') {
    const items = Array.isArray(block.items) ? block.items : [];
    const patchStat = (index, changes) => patch({
      items: items.map((current, position) => (position === index ? { ...current, ...changes } : current)),
    });

    return (
      <div className="docs-items">
        {items.map((item, index) => (
          <div className="docs-items__row docs-items__row--stats" key={`stat-${index}`}>
            <input
              className="docs-input docs-input--icon"
              placeholder="✨"
              value={item.icon || ''}
              onChange={event => patchStat(index, { icon: event.target.value })}
            />
            <input
              className="docs-input"
              placeholder={t('docs.admin.statValuePlaceholder')}
              value={item.value || ''}
              onChange={event => patchStat(index, { value: event.target.value })}
            />
            <input
              className="docs-input"
              placeholder={t('docs.admin.statLabelPlaceholder')}
              value={item.label || ''}
              onChange={event => patchStat(index, { label: event.target.value })}
            />
            <ItemTools
              index={index}
              t={t}
              total={items.length}
              onMove={offset => patch({ items: moveInArray(items, index, offset) })}
              onRemove={() => patch({ items: items.filter((_, position) => position !== index) })}
            />
          </div>
        ))}

        {items.length < docsLimits.listItems && (
          <AddItemButton t={t} onClick={() => patch({ items: [...items, { label: '', value: '', icon: '' }] })} />
        )}
      </div>
    );
  }

  if (block.type === 'spoiler') {
    return (
      <>
        <Row label={t('docs.admin.fieldSpoilerTitle')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderSpoilerTitle')}
            value={block.title || ''}
            onChange={event => patch({ title: event.target.value })}
          />
        </Row>
        <RichTextField rows={4} value={block.text} placeholder={t('docs.admin.placeholderText')} onChange={text => patch({ text })} />
      </>
    );
  }

  if (block.type === 'progress') {
    return (
      <>
        <Row label={t('docs.admin.fieldTone')}>
          <Segmented
            options={docsCalloutTones.map(item => ({ id: item.id, label: `${item.icon} ${t(item.labelKey)}` }))}
            value={block.tone || 'info'}
            onChange={tone => patch({ tone })}
          />
        </Row>
        <Row label={t('docs.admin.fieldProgressLabel')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderProgressLabel')}
            value={block.label || ''}
            onChange={event => patch({ label: event.target.value })}
          />
        </Row>
        <Row label={t('docs.admin.fieldProgressValue')}>
          <input
            className="docs-input docs-input--number"
            inputMode="numeric"
            placeholder="0"
            value={block.value ?? 0}
            onChange={event => patch({ value: toInteger(event.target.value) })}
          />
          <input
            className="docs-input docs-input--number"
            inputMode="numeric"
            placeholder="100"
            value={block.max ?? 100}
            onChange={event => patch({ max: Math.max(1, toInteger(event.target.value)) })}
          />
        </Row>
      </>
    );
  }

  if (block.type === 'link') {
    return (
      <>
        <Row label={t('docs.admin.fieldTone')}>
          <Segmented
            options={docsAccentTones.map(item => ({ id: item.id, label: `${item.icon} ${t(item.labelKey)}` }))}
            value={block.tone || 'accent'}
            onChange={tone => patch({ tone })}
          />
        </Row>
        <Row label={t('docs.admin.fieldLinkText')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderLinkText')}
            value={block.text || ''}
            onChange={event => patch({ text: event.target.value })}
          />
        </Row>
        <Row label={t('docs.admin.fieldLinkHref')}>
          <input
            className="docs-input"
            placeholder="https://t.me/…"
            value={block.href || ''}
            onChange={event => patch({ href: event.target.value })}
          />
        </Row>
        <Row label={t('docs.admin.fieldIcon')}>
          <input
            className="docs-input docs-input--icon"
            placeholder="🔗"
            value={block.icon || ''}
            onChange={event => patch({ icon: event.target.value })}
          />
        </Row>
      </>
    );
  }

  if (block.type === 'code') {
    return (
      <>
        <Row label={t('docs.admin.fieldLanguage')}>
          <input
            className="docs-input"
            placeholder={t('docs.admin.placeholderLanguage')}
            value={block.language || ''}
            onChange={event => patch({ language: event.target.value })}
          />
        </Row>
        <textarea
          className="docs-code-field"
          placeholder={t('docs.admin.placeholderCode')}
          rows={6}
          spellCheck="false"
          value={block.code || ''}
          onChange={event => patch({ code: event.target.value })}
        />
      </>
    );
  }

  if (block.type === 'table') {
    const head = Array.isArray(block.head) && block.head.length > 0 ? block.head : [''];
    const rows = Array.isArray(block.rows) ? block.rows : [];
    const columns = head.length;
    const safeRows = rows.map(row => Array.from({ length: columns }, (_, index) => row?.[index] ?? ''));

    const setHead = (cellIndex, value) => patch({ head: head.map((cell, index) => (index === cellIndex ? value : cell)) });

    const setCell = (rowIndex, cellIndex, value) => patch({
      rows: safeRows.map((row, index) => (
        index === rowIndex ? row.map((cell, position) => (position === cellIndex ? value : cell)) : row
      )),
    });

    return (
      <>
        <div className="docs-table-editor">
          <div className="docs-table-editor__row is-head">
            {head.map((cell, cellIndex) => (
              <input
                key={`head-${cellIndex}`}
                className="docs-input"
                placeholder={t('docs.admin.columnPlaceholder', { index: cellIndex + 1 })}
                value={cell}
                onChange={event => setHead(cellIndex, event.target.value)}
              />
            ))}
          </div>

          {safeRows.map((row, rowIndex) => (
            <div className="docs-table-editor__row" key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <input
                  key={`cell-${rowIndex}-${cellIndex}`}
                  className="docs-input"
                  placeholder={t('docs.admin.cellPlaceholder')}
                  value={cell}
                  onChange={event => setCell(rowIndex, cellIndex, event.target.value)}
                />
              ))}
              <IconButton danger icon={<FiTrash2 />} label={t('docs.admin.removeRow')} onClick={() => patch({ rows: safeRows.filter((_, index) => index !== rowIndex) })} />
            </div>
          ))}
        </div>

        <div className="docs-table-editor__tools">
          <button
            className="btn btn-ghost btn-small"
            disabled={safeRows.length >= docsLimits.tableRows}
            type="button"
            onClick={() => patch({ rows: [...safeRows, Array.from({ length: columns }, () => '')] })}
          >
            <FiPlus /> {t('docs.admin.addRow')}
          </button>
          <button
            className="btn btn-ghost btn-small"
            disabled={columns >= docsLimits.tableColumns}
            type="button"
            onClick={() => patch({ head: [...head, ''], rows: safeRows.map(row => [...row, '']) })}
          >
            <FiPlus /> {t('docs.admin.addColumn')}
          </button>
          <button
            className="btn btn-ghost btn-small"
            disabled={columns <= 1}
            type="button"
            onClick={() => patch({ head: head.slice(0, -1), rows: safeRows.map(row => row.slice(0, -1)) })}
          >
            <FiX /> {t('docs.admin.removeColumn')}
          </button>
        </div>
      </>
    );
  }

  if (block.type === 'divider') {
    return (
      <Row label={t('docs.admin.fieldStyle')}>
        <Segmented
          options={docsDividerStyles.map(item => ({ id: item.id, label: t(item.labelKey) }))}
          value={block.style}
          onChange={style => patch({ style })}
        />
      </Row>
    );
  }

  return null;
}

function Row({ label, children }) {
  return (
    <div className="docs-field">
      <span className="docs-field__label">{label}</span>
      <div className="docs-field__body">{children}</div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="docs-seg">
      {options.map(option => (
        <button
          key={option.id}
          className={`docs-seg__btn ${option.id === value ? 'is-active' : ''}`}
          type="button"
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Иконки выравнивания: векторные, а не «стрелочные» глифы ⇤ ⇹ ⇥. */
const alignIcons = {
  left: <FiAlignLeft />,
  center: <FiAlignCenter />,
  right: <FiAlignRight />,
};

function AlignPicker({ t, value, onChange }) {
  return (
    <div className="docs-seg docs-seg--icons">
      {docsAlignOptions.map(option => (
        <button
          key={option.id}
          aria-label={t(option.labelKey)}
          className={`docs-seg__btn ${option.id === value ? 'is-active' : ''}`}
          title={t(option.labelKey)}
          type="button"
          onClick={() => onChange(option.id)}
        >
          {alignIcons[option.id] || <FiAlignLeft />}
        </button>
      ))}
    </div>
  );
}

function IconButton({ icon, label, onClick, disabled, danger }) {
  return (
    <button
      aria-label={label}
      className={`docs-ico ${danger ? 'is-danger' : ''}`}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

/** Кнопки «выше / ниже / удалить» для элемента списка, плашек, шагов и метрик. */
function ItemTools({ t, index, total, onMove, onRemove }) {
  return (
    <div className="docs-items__tools">
      <IconButton label={t('docs.admin.moveItemUp')} disabled={index === 0} onClick={() => onMove(-1)} icon={<FiArrowUp />} />
      <IconButton label={t('docs.admin.moveItemDown')} disabled={index === total - 1} onClick={() => onMove(1)} icon={<FiArrowDown />} />
      <IconButton label={t('docs.admin.removeItem')} disabled={total <= 1} onClick={onRemove} icon={<FiTrash2 />} danger />
    </div>
  );
}

/** Кнопка «добавить пункт» под списком элементов блока. */
function AddItemButton({ t, onClick }) {
  return (
    <button className="docs-items__add" type="button" onClick={onClick}>
      <FiPlus /> {t('docs.admin.addItem')}
    </button>
  );
}

/** Текст из поля с `inputMode="numeric"`: пустая строка и мусор превращаются в 0. */
function toInteger(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);

  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export default DocsBlockFields;
