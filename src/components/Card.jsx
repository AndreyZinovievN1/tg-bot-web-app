function Card({
  as = 'div',
  children,
  className = '',
  ...props
}) {
  const Element = as;
  return <Element className={['card', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </Element>;
}
export default Card;
